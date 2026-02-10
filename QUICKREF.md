# Quick Reference

## Common Commands

```bash
# Setup
mehaisi init                    # Initialize in project
mehaisi status                  # Show current status

# Run agents
mehaisi run <agent-name>        # Run single agent
mehaisi agents --list           # List all agents

# Workflows
mehaisi workflow investigate    # Find all issues
mehaisi workflow cleanup        # Clean dead code
mehaisi workflow fix-apis       # Fix API issues
mehaisi workflow fix-ui         # Fix UI issues
mehaisi workflow optimize       # Optimize code
mehaisi workflow validate       # Run QA

# Pipelines (Full transformation)
mehaisi pipeline cautious       # Safe, step-by-step
mehaisi pipeline balanced       # Balanced approach
mehaisi pipeline aggressive     # Fast (risky)

# Coordination
mehaisi coordinate --goal "Fix all API issues"

# Reports & Status
mehaisi report --last           # Last session report
mehaisi diff --last             # Show changes
mehaisi rollback                # Undo changes

# Help
mehaisi --help                  # General help
mehaisi <command> --help        # Command help
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
mehaisi init

# 2. Investigate issues
mehaisi workflow investigate
# Review: .mehaisi/sessions/[id]/reports/

# 3. Clean up safe stuff
mehaisi workflow cleanup

# 4. Fix critical issues
mehaisi workflow fix-apis
mehaisi workflow fix-ui

# 5. Optimize
mehaisi workflow optimize

# 6. Validate
mehaisi workflow validate

# 7. Commit!
git commit -m "Mehaisi: Production-ready transformation"
```

## Configuration

Edit `.mehaisi/config.json`:

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

Create `.mehaisi/agents/my-agent.yml`:

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
mehaisi coordinate --goal "Your goal here"
```
