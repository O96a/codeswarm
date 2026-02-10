# Mehaisi — RuVector Integration & LLM Modularity Plan

> Formerly: CodeSwarm → **Mehaisi**
> Base LLM: `kimi-k2.5:cloud` via Ollama Cloud + Claude Code CLI
> Date: 2026-02-09

---

## 1. Project Rebrand: CodeSwarm → Mehaisi

### Scope
Rename all references from `codeswarm` to `mehaisi` across:

| Category | Files |
|---|---|
| Package metadata | `package.json`, `package-lock.json` |
| CLI entry point | `codeswarm.js` → `mehaisi.js` |
| Internal refs | `orchestrator.js`, `init.js`, `agent-runner.js`, `git-manager.js`, `report-generator.js`, `schema-validator.js`, `metrics-collector.js` |
| Commands/modules | `run.js`, `workflow.js`, `pipeline.js`, `agents.js`, `coordinate.js`, `status.js`, `report.js` |
| Documentation | `README.md`, `INSTALL.md`, `QUICKREF.md`, `DEPLOYMENT_GUIDE.md` |
| Tests | `tests/unit/git-manager.test.js` |
| Config dirs | `.codeswarm/` → `.mehaisi/` |

### Rules
- Binary name: `mehaisi`  
- Config directory: `.mehaisi/`
- NPM package name: `mehaisi`
- Git tags/branches: `mehaisi-session-*`

---

## 2. LLM Configuration

### Default Setup (Kimi 2.5 via Ollama Cloud)

```bash
# Environment variables for Claude Code CLI + Ollama Cloud
export ANTHROPIC_AUTH_TOKEN=ollama
export ANTHROPIC_BASE_URL=https://api.ollama.com  # or your Ollama Cloud endpoint
export ANTHROPIC_API_KEY=""

# Launch Claude Code with Kimi 2.5
claude --model kimi-k2.5:cloud
# Or via ollama launch:
ollama launch claude --model kimi-k2.5:cloud
```

### Provider Abstraction

```
┌─────────────────────────────────────────────────┐
│              LLM Provider Manager               │
├──────────┬──────────┬──────────┬────────────────┤
│ Ollama   │ Ollama   │ Direct   │ Claude Code    │
│ Cloud    │ Local    │ API      │ CLI            │
│ (default)│(fallback)│(optional)│ (primary exec) │
└──────────┴──────────┴──────────┴────────────────┘
```

**New file: `llm-provider.js`**

```javascript
class LLMProviderManager {
  constructor(config) {
    this.providers = {};
    this.defaultProvider = config.llm?.default_provider || 'ollama-cloud';
  }

  register(name, provider) { this.providers[name] = provider; }

  async execute(instructions, options = {}) {
    const provider = this.providers[options.provider || this.defaultProvider];
    return provider.execute(instructions, options);
  }

  async healthCheck() {
    const results = {};
    for (const [name, provider] of Object.entries(this.providers)) {
      results[name] = await provider.healthCheck().catch(() => false);
    }
    return results;
  }
}
```

**Provider Config Schema:**

```json
{
  "model": "kimi-k2.5:cloud",
  "llm": {
    "default_provider": "ollama-cloud",
    "providers": {
      "ollama-cloud": {
        "type": "ollama",
        "url": "https://api.ollama.com",
        "model": "kimi-k2.5:cloud",
        "priority": 1
      },
      "ollama-local": {
        "type": "ollama",
        "url": "http://localhost:11434",
        "model": "kimi-k2.5",
        "priority": 2,
        "fallback": true
      }
    },
    "routing": {
      "strategy": "default",
      "use_ruvector": false
    }
  }
}
```

---

## 3. Parallel Claude Code Execution — Hard Limits

### Resource Constraints for Ollama Cloud

| Limit | Value | Rationale |
|---|---|---|
| Max parallel instances | **3** | Ollama Cloud rate limits + memory |
| Per-instance timeout | **10 min** | Prevents stuck agents |
| Per-instance max tokens | **128K** | Kimi 2.5 context window |
| Queue depth | **10** | Backpressure to prevent overload |
| Cooldown between batches | **2 sec** | Rate limit safety margin |
| Max retries per agent | **2** | Avoid burning quota on broken agents |
| Total session timeout | **60 min** | Hard stop for runaway sessions |

### Implementation: `parallel-executor.js`

```javascript
const HARD_LIMITS = {
  MAX_PARALLEL: 3,              // Never more than 3 Claude instances
  INSTANCE_TIMEOUT_MS: 600000,  // 10 minutes per agent
  MAX_QUEUE_DEPTH: 10,          // Don't queue more than 10
  BATCH_COOLDOWN_MS: 2000,      // 2 sec between batches
  MAX_RETRIES: 2,               // Max 2 retries per agent
  SESSION_TIMEOUT_MS: 3600000,  // 1 hour max session
};

// These limits CANNOT be overridden by config — they protect Ollama Cloud quota
```

---

## 4. RuVector Integration — Minimal Dependencies

### Dependency Strategy

> **Core principle:** Install only the NPM packages needed. No Rust crates. No WASM bundles.

| Package | Size (approx) | Purpose | Install When |
|---|---|---|---|
| `ruvector` | ~2MB | Vector DB core | Phase B |
| `ruvector-tiny-dancer-node` | ~500KB | Agent routing | Phase B |
| `@ruvector/cli` | CLI tool | Claude Code hooks | Phase C (optional) |

**Excluded** (not needed for Mehaisi):
- All Rust crates (`ruvector-*` on crates.io)
- All WASM packages (`*-wasm`)
- `ruvllm` (we use Ollama, not ruvector's LLM runtime)
- `ruvector-raft`, `ruvector-cluster` (no distributed deployment needed)
- `ruvector-dag` (nice-to-have, defer to later)

**Total added dependency size: ~2.5MB** (vs potentially 100MB+ if installing everything)

### Integration Points

#### A. Vector Memory for Coordination Hub
```javascript
// Enhances coordination-hub.js — semantic search instead of JSON scanning
const { VectorDB } = require('ruvector');
const db = new VectorDB(384); // 384-dim embeddings matching Kimi 2.5

// Store agent findings as vectors
db.insert(findingId, embedding, { agent: 'api-detective', severity: 'high' });

// Search: "find similar past issues"
const similar = db.search(newIssueEmbedding, 5);
```

#### B. Agent Routing
```javascript
// Suggests best agent for a task (replaces manual selection)
const { TinyDancer } = require('ruvector-tiny-dancer-node');
const router = new TinyDancer({ model: 'ruvltra-claude-code-0.5b' });

const best = await router.route("fix API authentication", agentList);
// → { agent: 'api-detective', confidence: 0.91 }
```

#### C. Claude Code Hooks (Optional)
```bash
# Setup once — captures file edits, commands, errors as vectors
npx @ruvector/cli hooks init
npx @ruvector/cli hooks install

# Query learned patterns
npx @ruvector/cli hooks recall "authentication error"
```

---

## 5. Implementation Phases

### Phase A: Foundation (Do First)
1. Rebrand: CodeSwarm → Mehaisi
2. Create `llm-provider.js` with provider abstraction
3. Create `providers/ollama-cloud.js` (default — Kimi 2.5)
4. Create `providers/ollama-local.js` (fallback)
5. Create `providers/claude-code.js` (primary executor)
6. Create `parallel-executor.js` with hard limits
7. Refactor `agent-runner.js` to use provider layer
8. Update default config to use `kimi-k2.5:cloud`

### Phase B: RuVector Core
1. Install `ruvector` + `ruvector-tiny-dancer-node` (only these two)
2. Create `ruvector-memory.js` — vector wrapper
3. Create `ruvector-router.js` — agent routing wrapper
4. Enhance `coordination-hub.js` with vector search
5. Add routing to `orchestrator.js`

### Phase C: Self-Learning (Optional)
1. Setup Claude Code hooks
2. Create `sona-learner.js` — SONA integration
3. Feed `metrics-collector.js` data to SONA
4. Track routing accuracy improvements

---

## 6. Verification Plan

### Phase A Verification
- [ ] All `codeswarm` references replaced with `mehaisi`
- [ ] `mehaisi` CLI command works
- [ ] `.mehaisi/` config directory created by `init`
- [ ] Provider health check passes for Ollama Cloud
- [ ] Kimi 2.5 executes via Claude Code CLI
- [ ] Parallel execution respects hard limits (test with 5 agents, verify max 3 simultaneous)
- [ ] Existing unit tests pass after rebrand

### Phase B Verification
- [ ] Vector memory: store → search → retrieve with >80% relevance
- [ ] Agent routing: correct agent selected for 5 known task types
- [ ] No increase in `npm install` time beyond 5 seconds
- [ ] Total `node_modules` growth < 5MB

### Phase C Verification
- [ ] Claude Code hooks capture file edits
- [ ] SONA learning: routing accuracy improves over 10 sessions
