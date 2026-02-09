# CodeSwarm 🐝

Multi-agent AI code quality orchestration system powered by Claude Code and Ollama.

Transform messy codebases into production-grade applications using coordinated AI agents.

## Features

- **19 Specialized Agents**: From API detectives to performance optimizers
- **Agent Coordination**: Agents communicate and collaborate to solve complex issues
- **Safety First**: Git-based rollback, test validation, human approval gates
- **Framework Agnostic**: Works with React, Vue, Node, Python, and more
- **Cloud-Ready**: Seamlessly integrates with Ollama Cloud models via Claude Code

## Prerequisites

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
git clone https://github.com/O96a/codeswarm.git
cd codeswarm
npm install
sudo npm link
```

## Quick Start

```bash
# Initialize in your project
cd your-messy-repo
codeswarm init --model your-favorite-model

# Run investigation
codeswarm workflow investigate

# Fix issues
codeswarm workflow fix-apis
codeswarm workflow fix-ui

# Or run full pipeline
codeswarm pipeline cautious
```

## Ollama Cloud Integration

CodeSwarm can leverage **Ollama Cloud models** through Claude Code. To use a cloud-hosted model (like `gpt-oss:20b-cloud`), set the environment variable:

```bash
CLAUDE_CODE_OLLAMA_MODEL=gpt-oss:20b-cloud codeswarm workflow investigate
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

### Agent Coordination

Agents communicate through a **Coordination Hub**:
- Share findings in real-time
- Report issues for specialists
- Request help from other agents
- Avoid duplicate work
- Build on each other's discoveries

Example coordination flow:
```
API Detective → finds broken endpoint
       ↓
Coordination Hub → creates issue ticket
       ↓
API Connector → queries issue, fixes endpoint
       ↓
Integration Validator → tests the fix
```

## Commands

```bash
# Initialize
codeswarm init [--template react|node|python]

# List agents
codeswarm agents --list

# Run single agent
codeswarm run api-detective

# Run workflow
codeswarm workflow investigate   # All investigators
codeswarm workflow fix-apis      # Fix API issues
codeswarm workflow fix-ui        # Fix UI issues
codeswarm workflow optimize      # Optimize code
codeswarm workflow validate      # Run QA

# Run pipeline (full transformation)
codeswarm pipeline cautious      # Safe, step-by-step
codeswarm pipeline balanced      # Balanced speed/safety
codeswarm pipeline aggressive    # Fast (use with caution)

# Coordination mode
codeswarm coordinate --goal "Fix all API and UI issues"

# View reports
codeswarm report --last
codeswarm diff --last

# Rollback
codeswarm rollback [session-id]

# Status
codeswarm status
```

## Configuration

Edit `.codeswarm/config.json`:

```json
{
  "model": "qwen3-coder",
  "context_window": 128000,
  "ollama_url": "http://localhost:11434",
  "safety": {
    "auto_apply": false,
    "require_tests": true,
    "rollback_on_failure": true
  },
  "execution": {
    "parallel_agents": 1,
    "pause_on_error": true
  }
}
```

## Safety Features

- **Git-based rollback**: Every agent runs in isolated branch
- **Test validation**: Runs tests after each agent
- **Human approval**: Required for high-risk changes
- **Checkpoint system**: Rollback to any point
- **Token budgets**: Prevent runaway costs

## Example Session

```bash
$ codeswarm init
✓ 19 agents configured

$ codeswarm workflow investigate
🤖 Running: API Detective
  ℹ Found 12 API issues
  ⚠ Reported 5 critical issues
🤖 Running: UI Inspector
  ℹ Found 8 UI issues
  → Notified Event Binder
📊 Coordination Summary:
  Findings shared: 20
  Issues open: 13
  Active agents: 2

$ codeswarm workflow fix-apis
🤖 Running: API Connector
  → Querying API Detective findings
  ✓ Fixed: Replace localhost with env var (12 files)
  ✓ Fixed: Added error handling (8 files)
  ✓ Tests passed

$ codeswarm report --last
📊 Session Report:
  Agents: 3
  Files Modified: 20
  Issues Resolved: 13
```

## Troubleshooting

**"Ollama not found"**
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama login
```

**"Claude Code not found"**
```bash
curl -fsSL https://claude.ai/install.sh | bash
```

**"Tests failing"**
- Check test command in config.json
- Run tests manually first
- Use `--skip-tests` flag temporarily

## Best Practices

1. **Start with investigation**: Always run `investigate` workflow first
2. **Review before applying**: Don't use `--auto-approve` until comfortable
3. **Commit often**: Commit after each successful agent
4. **Run tests**: Don't skip test validation
5. **Read reports**: Agent reports are in `.codeswarm/sessions/[id]/reports/`

## Contributing

Issues and PRs welcome at [https://github.com/O96a/codeswarm](https://github.com/O96a/codeswarm)

## License

MIT