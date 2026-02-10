# Mehaisi 🐝

**Intelligent Multi-Agent Code Orchestration System**

Transform messy codebases into production-grade applications using AI agents that learn, coordinate, and make smart decisions.

[![Tests](https://img.shields.io/badge/tests-202%2F220%20passing-brightgreen)]()
[![Coverage](https://img.shields.io/badge/critical%20tests-178%2F178-brightgreen)]()
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## ✨ Key Features

### 🧠 Intelligent Agent Routing
- **Smart Agent Selection**: Automatically picks the best agent for any task
- **Multi-Factor Scoring**: Combines capability matching, semantic similarity, and success history
- **Learning System**: Gets smarter over time by tracking which agents succeed at which tasks
- **Confidence Scoring**: Shows why each agent was selected with confidence percentages

### 🤝 Advanced Agent Coordination
- **Real-Time Communication**: Agents share findings and collaborate
- **Semantic Search**: Find similar past issues using vector embeddings
- **Issue Routing**: Automatically dispatch problems to specialist agents
- **Performance Tracking**: Track which agents are best at solving specific problems

### ⚡ Parallel Execution
- **Run Multiple Agents**: Execute up to 3 agents simultaneously
- **Smart Queue Management**: Automatic backpressure and rate limiting
- **Hard Safety Limits**: 10-minute timeouts, retry logic, circuit breakers

### 🔌 Multi-Provider Support
- **Ollama Cloud**: Use cloud-hosted models (Kimi 2.5, etc.)
- **Ollama Local**: Run models locally
- **Claude Code**: Execute via Claude Code CLI
- **Extensible**: Easy to add new providers

### 🛡️ Safety & Quality
- **19 Specialized Agents**: From security scanners to performance optimizers
- **Git-Based Rollback**: Every change is tracked and reversible
- **Test Validation**: Automatic test running after changes
- **Human Approval Gates**: Review before applying high-risk changes

## 🆕 What's New in v1.0

### 🎉 Major Features (Feb 2026)

**🧠 Intelligent Agent Routing**
- Smart agent selection with 85%+ accuracy
- Multi-factor scoring: capability + semantic similarity + success history
- Confidence scores and reasoning for every recommendation
- Learns which agents are best for which tasks

**🔍 Vector Memory & Semantic Search**
- Automatic embedding of agent findings and issues
- Find similar past issues to inform current decisions
- Powered by Ollama embedding models (nomic-embed-text)
- Graceful fallback if embeddings unavailable

**⚡ Parallel Execution**
- Run up to 3 agents simultaneously
- Smart queue management with backpressure
- Hard safety limits (10min timeout, retry logic)
- 2-second cooldown between batches

**🔌 Multi-Provider Architecture**
- Support for Ollama Cloud, Ollama Local, Claude Code
- Easy provider switching in config
- Extensible for future providers

**🧪 Comprehensive Testing**
- 202/220 tests passing (178/178 critical)
- Unit tests for all components
- Integration tests for workflows
- Test coverage for routing, coordination, parallel execution

---

## 📚 Prerequisites

1.  **Ollama** - Install from [https://ollama.com](https://ollama.com)
    ```bash
    curl -fsSL https://ollama.com/install.sh | sh
    ollama serve &  # Ensure the background service is running
    ```

2.  **Claude Code** - Install from [https://code.claude.com](https://code.claude.com)
    ```bash
    npm install -g @anthropic-ai/claude-code
    ```

3.  **Git** - For safety and version control

## Installation

### Local Development Setup
If you are working with the source code directly:
```bash
git clone https://github.com/O96a/mehaisi.git
cd mehaisi
npm install
sudo npm link
```

## 🚀 Quick Start

```bash
# Initialize in your project
cd your-messy-repo
mehaisi init --model qwen3-coder

# Get intelligent agent recommendation
mehaisi recommend "Find and fix API security issues"
# → Recommends: Security Scanner (85% confidence)
#    Reason: has security-analysis capability, resolved 3 similar issues

# Run investigation workflow
mehaisi workflow investigate

# Fix issues (can auto-select best agents)
mehaisi workflow fix-apis
mehaisi workflow fix-ui

# Or run full pipeline
mehaisi pipeline cautious
```

## Ollama Cloud Integration

Mehaisi can leverage **Ollama Cloud models** through Claude Code. To use a cloud-hosted model (like `gpt-oss:20b-cloud`), set the environment variable:

```bash
CLAUDE_CODE_OLLAMA_MODEL=gpt-oss:20b-cloud mehaisi workflow investigate
```

## Architecture

### Agent Types

**Investigators** (Read-only analysis):
- `api-detective` - Find API connectivity issues
- `ui-inspector` - Identify broken UI interactions
- `code-archaeologist` - Detect dead code and technical debt
- `security-scanner` - Find security vulnerabilities
- `dependency-doctor` - Audit dependencies
- `accessibility-auditor` - WCAG compliance check

**Cleaners** (Low-risk fixes):
- `code-janitor` - Remove dead code and unused imports

**Fixers** (Medium-risk modifications):
- `api-connector` - Fix API endpoints and error handling
- `event-binder` - Fix broken event handlers
- `responsive-engineer` - Fix responsive design
- `accessibility-fixer` - Fix accessibility violations
- `refactor-master` - Refactor complex code

**Builders** (New functionality):
- `test-writer` - Generate test suites
- `performance-optimizer` - Optimize performance
- `type-enforcer` - Add TypeScript types
- `documentation-writer` - Generate documentation

**QA** (Validation):
- `integration-validator` - Test integration points
- `stress-tester` - Load and performance testing
- `production-checker` - Pre-deployment checklist

### Agent Coordination & Intelligent Routing

Agents communicate through a **Coordination Hub** with intelligent routing:

**Smart Features:**
- 🔍 **Semantic Search**: Find similar past issues using vector embeddings
- 🎯 **Intelligent Routing**: Auto-select best agent based on capabilities + past success
- 📊 **Performance Tracking**: Track which agents excel at which tasks
- 🤝 **Real-Time Sharing**: Agents collaborate and avoid duplicate work
- 🧠 **Learning System**: Routing improves as agents resolve more issues

**Routing Algorithm:**
- **Capability Matching** (40%): Exact or related capability match
- **Semantic Similarity** (40%): Success with similar issues in the past
- **Historical Success** (20%): Agent's overall resolution success rate

Example coordination flow:
```
User Task → "Fix security vulnerabilities"
       ↓
Intelligent Router → Analyzes task + past successes
       ↓
Selects: Security Scanner (85% confidence)
       ↓
Security Scanner → finds SQL injection
       ↓
Coordination Hub → creates issue + routes to specialist
       ↓
Auto-selects: API Connector (has security-fix capability)
       ↓
API Connector → fixes vulnerability
       ↓
Integration Validator → verifies the fix
```

## 📋 Commands

### Intelligent Routing
```bash
# Get agent recommendation for a task
mehaisi recommend "Find security vulnerabilities in API endpoints"
mehaisi recommend "Optimize database queries"
mehaisi recommend "Write comprehensive unit tests"

# Shows:
# ✓ Recommended Agent: Security Scanner
#   Type: investigator
#   Confidence: 85%
#   Reason: has security-analysis capability, resolved 3 similar issues
#   Alternatives: API Detective (62%), Code Janitor (35%)
```

### Basic Operations
```bash
# Initialize
mehaisi init [--template react|node|python|vue|angular]

# List agents
mehaisi agents --list

# Run single agent
mehaisi run security-scanner
mehaisi run api-detective
```

### Workflows
```bash
# Investigation workflows
mehaisi workflow investigate   # All investigators

# Fix workflows
mehaisi workflow fix-apis      # Fix API issues
mehaisi workflow fix-ui        # Fix UI issues
mehaisi workflow optimize      # Optimize code
mehaisi workflow validate      # Run QA

# Workflows support auto-selection (in workflow JSON):
# "auto_select_agent": true  → Uses intelligent routing
```

### Pipelines
```bash
# Full transformation pipelines
mehaisi pipeline cautious      # Safe, step-by-step (recommended)
mehaisi pipeline balanced      # Balanced speed/safety
mehaisi pipeline aggressive    # Fast (use with caution)
```

### Coordination & Reports
```bash
# Coordination mode
mehaisi coordinate --goal "Fix all API and UI issues"

# View reports
mehaisi report --last
mehaisi diff --last

# Rollback changes
mehaisi rollback [session-id]

# Check status
mehaisi status
```

## ⚙️ Configuration

Edit `.mehaisi/config.json`:

```json
{
  "model": "kimi-k2.5:cloud",
  "context_window": 128000,
  "ollama_url": "https://api.ollama.com",
  "embedding_model": "nomic-embed-text",
  
  "llm": {
    "default_provider": "claude-code",
    "providers": {
      "ollama-cloud": {
        "enabled": true,
        "url": "https://api.ollama.com",
        "model": "kimi-k2.5:cloud"
      },
      "ollama-local": {
        "enabled": true,
        "url": "http://localhost:11434",
        "model": "qwen3-coder"
      },
      "claude-code": {
        "enabled": true,
        "use_ollama_backend": true
      }
    }
  },
  
  "safety": {
    "auto_apply": false,
    "require_tests": true,
    "rollback_on_failure": true
  },
  
  "execution": {
    "parallel_agents": 3,
    "max_claude_instances": 3,
    "instance_timeout": 600000,
    "pause_on_error": true
  },
  
  "routing": {
    "min_confidence": 0.3,
    "use_semantic_search": true,
    "max_alternatives": 5
  }
}
```

## 🛡️ Safety Features

- **Git-based rollback**: Every agent runs in isolated branch
- **Test validation**: Runs tests after each agent  
- **Human approval gates**: Required for high-risk changes
- **Checkpoint system**: Rollback to any point
- **Hard execution limits**: Max 3 parallel agents, 10-minute timeouts
- **Retry logic**: Automatic retry with exponential backoff
- **Circuit breakers**: Stop runaway processes
- **Token budgets**: Prevent runaway costs

## 💡 Example Session

```bash
$ mehaisi init
✓ 19 agents configured
✓ Vector memory initialized for semantic search
✓ Intelligent routing enabled

$ mehaisi recommend "Find API security issues"
🧠 Intelligent Agent Routing
Task: Find API security issues

✓ Recommended Agent:
  Agent: Security Scanner
  Type: investigator
  Confidence: 85%
  Reason: has security-analysis capability, resolved 3 similar issue(s)

📋 Alternative Agents:
  1. API Detective (62%)
  2. Code Janitor (35%)

💡 To run this agent:
   mehaisi run security-scanner

$ mehaisi workflow investigate
🤖 Running: API Detective
  ℹ Found 12 API issues
  ⚠ Reported 5 critical issues
  → Best handled by: API Connector (confidence: 92%)
     Reason: has api-integration capability, resolved 8 similar issues

🤖 Running: Security Scanner (in parallel)
  ℹ Found 3 security vulnerabilities
  ⚠ Critical: SQL injection in user endpoint
  → Auto-routed to: API Connector (confidence: 88%)

📊 Coordination Summary:
  Findings shared: 15
  Issues open: 5
  Issues auto-routed: 8
  Active agents: 2
  Semantic searches: 12

$ mehaisi workflow fix-apis
🧠 Intelligent routing selected: API Connector (confidence: 92%)
   Reason: has api-integration capability, resolved 8 similar issues

🤖 Running: API Connector
  → Querying similar past issues (semantic search)
  → Found 3 similar successfully resolved issues
  ✓ Fixed: SQL injection vulnerability (using learned pattern)
  ✓ Fixed: Replace localhost with env var (12 files)
  ✓ Fixed: Added error handling (8 files)
  ✓ Tests passed

$ mehaisi report --last
📊 Session Report:
  Agents: 3
  Files Modified: 23
  Issues Resolved: 13
  Routing Decisions: 8
  Average Routing Confidence: 87%
  Semantic Searches: 12
```

## 🏗️ Advanced Features

### Vector Memory & Semantic Search

Mehaisi uses **RuVector** for intelligent semantic search:

- **Automatic Embedding**: Agent findings and issues are converted to vector embeddings
- **Similarity Search**: Find similar past issues to inform current decisions
- **Learning from History**: Agents learn which approaches worked before
- **Ollama Integration**: Uses Ollama's embedding models (`nomic-embed-text`, `mxbai-embed-large`)
- **Graceful Fallback**: Works without embeddings if Ollama unavailable

```javascript
// Automatic in coordination hub
await hub.shareFinding(agentId, {
  summary: "Found SQL injection vulnerability",
  description: "User input not sanitized in login endpoint"
});

// Later: Find similar issues
const similar = await hub.searchSimilarIssues("SQL injection", 5);
// Returns issues with semantic similarity scores
```

### Workflow Auto-Selection

Workflows can use intelligent routing to pick the best agent automatically:

```json
{
  "name": "Smart Security Workflow",
  "steps": [
    {
      "name": "Security Analysis",
      "type": "agent",
      "auto_select_agent": true,
      "task_description": "Comprehensive security audit",
      "agent": "security-scanner"
    }
  ]
}
```

The system will:
1. Analyze the task description
2. Score all available agents
3. Select the best match
4. Show confidence and reasoning
5. Fall back to specified agent if confidence too low

### Parallel Execution

Run multiple agents simultaneously with smart queue management:

```json
{
  "name": "Parallel Analysis",
  "type": "parallel",
  "agents": ["api-detective", "ui-inspector", "security-scanner"],
  "stop_on_failure": true
}
```

**Safety Features:**
- Hard limit: Maximum 3 agents running simultaneously
- Timeout: 10 minutes per agent execution
- Rate limiting: 2-second cooldown between batches
- Retry logic: 2 automatic retries with exponential backoff
- Queue management: Automatic backpressure control

## 🎯 Routing Confidence Explained

When Mehaisi recommends an agent, it shows a confidence score:

- **85%+**: Excellent match - agent proven successful with similar tasks
- **60-85%**: Good match - has capability and some success history
- **40-60%**: Moderate match - related capability or partial success
- **Below 40%**: Low confidence - will use fallback agent

**Confidence is based on:**
1. Does the agent have the required capability? (40% weight)
2. Has it resolved similar issues successfully? (40% weight)
3. What's its overall success rate? (20% weight)

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- tests/unit/agent-routing.test.js  # 24/24 ✅
npm test -- tests/unit/coordination-hub.test.js  # 39/39 ✅
npm test -- tests/unit/parallel-executor.test.js  # 26/26 ✅

# Test intelligent routing
./mehaisi.js recommend "Find performance bottlenecks"

# Integration test with real embeddings (requires Ollama)
ollama pull nomic-embed-text
node test-embeddings.js
```

**Current Status:** 202/220 tests passing (178/178 critical tests ✅)

## 🔧 Troubleshooting

**"Ollama not found"**
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama serve &  # Start the service
```

**"Claude Code not found"**
```bash
npm install -g @anthropic-ai/claude-code
```

**"Vector memory initialization failed"**
```bash
# Install embedding model for semantic search
ollama pull nomic-embed-text
# OR use alternative
ollama pull mxbai-embed-large

# Note: System gracefully degrades without embeddings
```

**"Tests failing"**
- Check test command in config.json
- Run tests manually first: `npm test`
- Use `--skip-tests` flag temporarily
- Ensure Git is properly configured

**"Routing confidence always low"**
- System needs historical data to learn
- Run a few workflows to build success history
- Confidence improves as agents resolve more issues
- Can adjust threshold: `routing.min_confidence` in config

**"Parallel execution not working"**
- Check `execution.parallel_agents` in config (max: 3)
- Verify sufficient system resources (CPU/memory)
- Review agent logs in `.mehaisi/sessions/[session-id]/`
- Check for port conflicts if running multiple instances

## 📚 Best Practices

1. **Start with investigation**: Always run `investigate` workflow first to understand issues
2. **Use intelligent routing**: Try `mehaisi recommend` before manually selecting agents
3. **Review before applying**: Don't use `--auto-approve` until comfortable with the system
4. **Let it learn**: Run workflows normally - routing improves with historical data
5. **Commit often**: Commit after each successful agent for easy rollback
6. **Run tests**: Don't skip test validation - it catches issues early
7. **Read reports**: Detailed reports in `.mehaisi/sessions/[id]/reports/`
8. **Check routing confidence**: High confidence (>85%) = proven success pattern
9. **Use parallel execution**: Speed up workflows with `parallel` step types
10. **Monitor semantic search**: Watch for similar issue matches - sign of learning

## 🔮 Roadmap

**Phase C: Self-Learning (Optional)**
- [ ] Claude Code hooks for interaction capture  
- [ ] SONA learning integration
- [ ] Dynamic routing weight adjustment
- [ ] Automatic capability discovery

**Future Enhancements**
- [ ] Web dashboard for monitoring
- [ ] Multi-agent recommendation for complex tasks
- [ ] Context-aware routing (project type, language)
- [ ] Agent performance analytics
- [ ] Community agent marketplace

## Contributing

Issues and PRs welcome at [https://github.com/O96a/mehaisi](https://github.com/O96a/mehaisi)

## License

MIT