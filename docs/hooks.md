# Claude Code Hooks - Implementation Guide

## Overview

Claude Code Hooks enable Mehaisi CodeSwarm to capture and learn from actual agent interactions. This creates a feedback loop where the system improves routing decisions based on real-world outcomes.

## What Gets Captured

### 1. **Agent Execution Data**
- Task description given to agent
- Agent selected (and confidence score)
- Execution duration
- Success/failure outcome
- Errors encountered

### 2. **File Operations**
- Files read by agents
- Files modified/created by agents
- Code patterns that worked
- Code patterns that failed

### 3. **Commands Executed**
- Terminal commands run
- Test results
- Build outcomes
- Linting/formatting results

### 4. **Coordination Events**
- Findings shared between agents
- Issues reported and resolved
- Helper agent requests
- Agent handoffs

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Agent Execution                      │
│  ┌──────────┐           ┌───────────┐                  │
│  │  Agent   │──events──▶│  Hooks    │                  │
│  │ Runner   │           │ Collector │                  │
│  └──────────┘           └─────┬─────┘                  │
│                               │                         │
│                               ▼                         │
│                     ┌──────────────────┐                │
│                     │  Learning Data   │                │
│                     │   (Vector DB)    │                │
│                     └────────┬─────────┘                │
│                              │                          │
│                              ▼                          │
│                     ┌──────────────────┐                │
│                     │  SONA Learner    │                │
│                     │ (Weight Adjuster)│                │
│                     └────────┬─────────┘                │
│                              │                          │
│                              ▼                          │
│                   ┌────────────────────┐                │
│                   │ Improved Routing   │                │
│                   │  (Next Execution)  │                │
│                   └────────────────────┘                │
└─────────────────────────────────────────────────────────┘
```

## Implementation Components

### 1. Hooks Collector (`hooks-collector.js`)

Intercepts and captures interaction data during agent execution.

**Events Captured:**
- `agent:start` - Agent begins execution
- `agent:complete` - Agent finishes (success/failure)
- `file:read` - File accessed by agent
- `file:write` - File modified/created
- `command:execute` - Terminal command run
- `test:run` - Test execution result
- `coordination:event` - Agent coordination activity

**Storage:**
- Raw events → `.mehaisi/sessions/<session-id>/hooks/`
- Embeddings → Vector memory for similarity search
- Aggregated metrics → Learning database

### 2. SONA Learner (`sona-learner.js`)

**SONA** = **S**elf-**O**ptimizing **N**eural-inspired **A**gent router

Analyzes captured data to improve routing decisions.

**Learning Mechanisms:**
1. **Success Rate Tracking**
   - Track which agents succeed at which task types
   - Adjust agent confidence scores based on outcomes

2. **Capability Discovery**
   - Infer agent capabilities from successful completions
   - Update capability relationships automatically

3. **Weight Optimization**
   - Current: 40% capability, 40% semantic, 20% success
   - Learn optimal weights from outcomes
   - Different weights for different task types

4. **Pattern Recognition**
   - Identify task patterns that predict agent success
   - Recognize anti-patterns (common failure modes)
   - Build task→agent mapping from real data

### 3. Learning Dashboard (`learning-dashboard.js`)

Visualize learning progress and routing improvements.

**Metrics Displayed:**
- Routing accuracy over time
- Agent success rates by task type
- Capability discovery progress
- Weight adjustments timeline
- Confidence calibration (predicted vs actual success)

## Setup Process

### Step 1: Initialize Hooks System

Run during `codeswarm init` or as standalone command:

```bash
codeswarm hooks init
```

This creates:
- `.mehaisi/hooks/` directory structure
- `hooks-config.json` settings file
- Learning database initialization
- Event capture infrastructure

### Step 2: Enable Hooks for Agent Execution

Hooks are automatically enabled when `coordination.learning.enabled = true` in config.json:

```json
{
  "coordination": {
    "enabled": true,
    "learning": {
      "enabled": true,
      "capture_file_operations": true,
      "capture_commands": true,
      "capture_coordination": true,
      "min_sessions_for_learning": 5
    }
  }
}
```

### Step 3: Run Agents Normally

No changes needed - hooks capture data transparently:

```bash
codeswarm run security-scanner
codeswarm workflow fix-apis
codeswarm coordinate --goal "Optimize performance"
```

### Step 4: View Learning Progress

```bash
# Show learning dashboard
codeswarm learning dashboard

# Show routing accuracy improvements
codeswarm learning stats

# Show discovered capabilities
codeswarm learning capabilities

# Export learning data
codeswarm learning export --format json > learning-data.json
```

### Step 5: Apply Learned Improvements

Learning is applied automatically, but you can review/adjust:

```bash
# Show current routing weights
codeswarm learning weights

# Reset weights to defaults
codeswarm learning weights --reset

# Manually adjust weight (not recommended)
codeswarm learning weights --capability 0.5 --semantic 0.3 --success 0.2
```

## File Operations Capture

### Implementation in `agent-runner.js`

```javascript
// Before agent execution
const hooksCollector = this.coordinationHub.hooksCollector;
await hooksCollector.captureEvent('agent:start', {
  agentId: options.agentId,
  agentName: agentName,
  task: agentConfig.instructions.substring(0, 200),
  timestamp: Date.now()
});

// During execution - file system wrapper
const fs = hooksCollector.wrapFileSystem(require('fs-extra'));
// Now fs.readFile, fs.writeFile etc. are automatically logged

// After execution
await hooksCollector.captureEvent('agent:complete', {
  agentId: options.agentId,
  success: result.success,
  duration: Date.now() - startTime,
  filesModified: result.filesModified,
  testsRun: result.testsRun
});
```

### What Gets Stored

For each file operation:
```json
{
  "event": "file:write",
  "timestamp": 1707580800000,
  "agentId": "security-scanner-abc123",
  "agentName": "security-scanner",
  "filePath": "src/api/auth.js",
  "operation": "modify",
  "linesChanged": 15,
  "success": true,
  "context": {
    "taskType": "security-fix",
    "issueType": "sql-injection"
  }
}
```

## Command Execution Capture

### Implementation in `agent-runner.js`

```javascript
// Wrap command execution
const commandResult = await hooksCollector.captureCommand(
  'npm test',
  async () => {
    // Original command execution
    return await runCommand('npm test');
  },
  {
    agentId: options.agentId,
    purpose: 'validation'
  }
);
```

### What Gets Stored

```json
{
  "event": "command:execute",
  "timestamp": 1707580800000,
  "agentId": "test-writer-xyz789",
  "command": "npm test",
  "exitCode": 0,
  "duration": 2341,
  "output": "✓ 24 tests passing",
  "success": true,
  "context": {
    "purpose": "validation",
    "triggeredBy": "agent"
  }
}
```

## Learning Data Storage

### Vector Memory

Store embeddings for:
- Task descriptions → Successful agent
- Issue patterns → Resolution strategies
- Error messages → Fix patterns

### Learning Database Structure

```
.mehaisi/sessions/<session-id>/
  hooks/
    events.jsonl           # All captured events
    file-ops.jsonl         # File operations only
    commands.jsonl         # Command executions
    coordination.jsonl     # Agent coordination events
  learning/
    routing-outcomes.json  # Task → Agent → Success
    capability-map.json    # Discovered capabilities
    weights-history.json   # Weight adjustments over time
    patterns.json          # Learned task patterns
```

## SONA Learning Algorithm

### Phase 1: Data Collection (First 5-10 sessions)

Capture data without adjustments:
- Build baseline routing accuracy
- Identify task type patterns
- Track agent success rates
- Record confidence vs. actual outcomes

### Phase 2: Weight Calibration (After 10+ sessions)

Adjust routing weights based on outcomes:

```javascript
// Example: If semantic similarity predicts success better than capabilities
// Old weights: 40% capability, 40% semantic, 20% success
// New weights: 30% capability, 50% semantic, 20% success

const learner = newSONALearner(learningData);
const optimizedWeights = await learner.optimizeWeights({
  targetMetric: 'routing_accuracy',
  minSessionsForAdjustment: 10,
  maxWeightShift: 0.1  // Don't shift more than 10% per adjustment
});
```

### Phase 3: Capability Discovery (Ongoing)

Learn new agent capabilities from successful completions:

```javascript
// If security-scanner successfully fixed a performance issue 3+ times,
// add 'performance-optimization' to its discovered_capabilities

const discovered = await learner.discoverCapabilities({
  minSuccessCount: 3,
  confidenceThreshold: 0.7
});

// Update agent configs with discovered capabilities
```

### Phase 4: Pattern Recognition (Advanced)

Build task→agent mapping from patterns:

```javascript
// "API authentication error" → security-scanner (95% success rate)
// "React render performance" → performance-optimizer (88% success rate)
// "CSS layout bug" → ui-inspector (92% success rate)

const patterns = await learner.extractPatterns({
  minOccurrences: 5,
  minSuccessRate: 0.8
});
```

## Performance Considerations

### Storage Impact
- Event logs: ~10KB per agent execution
- Embeddings: ~1.5KB per task/outcome pair
- Total per session: ~50-100KB

### Compute Impact
- Weight optimization: Run every 10 sessions (~1-2 seconds)
- Pattern extraction: Run weekly (~5-10 seconds)
- Real-time capture: <5ms overhead per event

### Privacy & Safety
- File contents are NOT captured (only paths/sizes)
- API keys and secrets filtered from command outputs
- User can disable hooks anytime: `codeswarm config set learning.enabled false`

## Testing Hooks

### Verify Capture Works

```bash
# Run an agent with hooks enabled
codeswarm run test-writer --debug-hooks

# Check events were captured
cat .mehaisi/sessions/latest/hooks/events.jsonl

# Should see entries like:
# {"event":"agent:start","agentId":"...","timestamp":...}
# {"event":"file:read","path":"...","timestamp":...}
# {"event":"agent:complete","success":true,"timestamp":...}
```

### Test Learning

```bash
# Run multiple sessions with same task type
for i in {1..5}; do
  codeswarm run security-scanner
done

# Check if learning data accumulated
codeswarm learning stats

# Should show:
# Sessions analyzed: 5
# Routing decisions: 23
# Routing accuracy: 78% → 85%  (improvement over time)
```

## Troubleshooting

### Hooks Not Capturing Data

1. Check learning is enabled:
   ```bash
   codeswarm config get coordination.learning.enabled
   # Should return: true
   ```

2. Check hooks directory exists:
   ```bash
   ls -la .mehaisi/sessions/latest/hooks/
   ```

3. Run with debug mode:
   ```bash
   codeswarm run <agent> --debug-hooks
   ```

### Learning Not Improving Routing

1. Need more sessions (minimum 5-10):
   ```bash
   codeswarm learning stats
   # Check "Sessions analyzed" count
   ```

2. Check weight adjustments are allowed:
   ```bash
   codeswarm config get coordination.learning.auto_adjust_weights
   # Should return: true
   ```

3. Review learning logs:
   ```bash
   cat .mehaisi/learning/weights-history.json
   ```

## Security Considerations

### Data Captured
- ✅ File paths (safe)
- ✅ Command names (safe)
- ✅ Exit codes (safe)
- ✅ Agent names (safe)
- ❌ File contents (NOT captured)
- ❌ API keys/secrets (filtered)
- ❌ User credentials (filtered)

### Filters Applied

All captured data passes through security filters:
```javascript
const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /auth/i,
  /bearer\s+[a-zA-Z0-9]/i
];
```

### User Control

Users can:
- Disable hooks anytime
- Delete learning data: `rm -rf .mehaisi/sessions/*/hooks/`
- Review all captured events before they're used for learning
- Opt-out of specific event types in config

## Future Enhancements

1. **Multi-Agent Orchestration Learning**
   - Learn which agent combinations work best
   - Predict optimal agent execution order

2. **Context-Aware Routing**
   - Factor in project type (React vs Vue)
   - Consider time of day, agent workload
   - Account for repository size/complexity

3. **Transfer Learning**
   - Share learned patterns across projects (with permission)
   - Build community knowledge base
   - Contribute to agent marketplace

4. **Explainable AI**
   - Show why an agent was selected
   - Confidence intervals with reasoning
   - Alternative agent suggestions with rationale

## References

- Main implementation: `sona-learner.js`
- Event capture: `hooks-collector.js`
- Dashboard: `learning-dashboard.js`
- Tests: `tests/unit/sona-learner.test.js`
- Integration: `coordination-hub.js` (lines 395-620)

---

**Last Updated:** 2026-02-10  
**Status:** Implementation Ready  
**Estimated Complexity:** Medium (6-8 hours)
