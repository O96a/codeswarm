# Quick Reference

## Common Commands

```bash
# Setup
codeswarm init                    # Initialize in project
codeswarm status                  # Show current status

# Run agents
codeswarm run <agent-name>        # Run single agent
codeswarm agents --list           # List all agents

# Workflows
codeswarm workflow investigate    # Find all issues
codeswarm workflow cleanup        # Clean dead code
codeswarm workflow fix-apis       # Fix API issues
codeswarm workflow fix-ui         # Fix UI issues
codeswarm workflow optimize       # Optimize code
codeswarm workflow validate       # Run QA

# Pipelines (Full transformation)
codeswarm pipeline cautious       # Safe, step-by-step
codeswarm pipeline balanced       # Balanced approach
codeswarm pipeline aggressive     # Fast (risky)

# Coordination
codeswarm coordinate --goal "Fix all API issues"

# Reports & Status
codeswarm report --last           # Last session report
codeswarm diff --last             # Show changes
codeswarm rollback                # Undo changes

# Help
codeswarm --help                  # General help
codeswarm <command> --help        # Command help
```

## Agent Categories

**Investigators (Read-only)**
- api-detective, ui-inspector, code-archaeologist
- security-scanner, dependency-doctor, accessibility-auditor

**Cleaners (Low-risk)**
- code-janitor

**Fixers (Medium-risk)**
- api-connector, event-binder, responsive-engineer
- accessibility-fixer, refactor-master

**Builders (New features)**
- test-writer, performance-optimizer, type-enforcer
- documentation-writer

**QA (Validation)**
- integration-validator, stress-tester, production-checker

## Workflow: First Time Use

```bash
# 1. Initialize
codeswarm init

# 2. Investigate issues
codeswarm workflow investigate
# Review: .codeswarm/sessions/[id]/reports/

# 3. Clean up safe stuff
codeswarm workflow cleanup

# 4. Fix critical issues
codeswarm workflow fix-apis
codeswarm workflow fix-ui

# 5. Optimize
codeswarm workflow optimize

# 6. Validate
codeswarm workflow validate

# 7. Commit!
git commit -m "CodeSwarm: Production-ready transformation"
```

## Configuration

Edit `.codeswarm/config.json`:

```json
{
  "model": "qwen3-coder",          // Ollama model to use
  "safety": {
    "auto_apply": false,            // Require manual approval
    "require_tests": true,          // Run tests after changes
    "rollback_on_failure": true     // Auto-rollback if tests fail
  }
}
```

## Custom Agents

Create `.codeswarm/agents/my-agent.yml`:

```yaml
name: My Agent
type: investigator
risk_level: low
coordination:
  enabled: true
  capabilities: [my-capability]
instructions: |
  Your instructions here...
output:
  report: "reports/my-agent.md"
```

## Coordination

Agents coordinate automatically through shared findings:
- Investigators find issues
- Fixers query those issues
- Builders add features based on findings
- QA validates everything

Enable explicit coordination:
```bash
codeswarm coordinate --goal "Your goal here"
```
