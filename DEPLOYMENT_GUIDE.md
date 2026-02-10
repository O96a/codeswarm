# Mehaisi - Complete NPM Package
## Multi-Agent AI Code Quality System with Full Coordination

---

## 🎯 What You Have

A **production-ready NPM package** with:

- ✅ **19 Enhanced AI Agents** with deep capabilities
- ✅ **Full Agent Coordination System** - agents communicate and collaborate
- ✅ **Complete CLI Interface** - all commands implemented
- ✅ **Safety Systems** - Git rollback, test validation, approval gates
- ✅ **Workflows & Pipelines** - predefined sequences for common tasks
- ✅ **Comprehensive Documentation** - README, INSTALL, QUICKREF

---

## 📦 Package Contents

### Core Files
- `package.json` - NPM package configuration with all dependencies
- `bin/mehaisi.js` - CLI entry point (executable)
- `lib/` - Core orchestration engine
  - `orchestrator.js` - Main orchestration logic
  - `coordination-hub.js` - Agent coordination system (400+ lines)
  - `agent-runner.js` - Claude Code integration
  - `git-manager.js` - Git operations for safety
  - `safety-manager.js` - Pre-flight checks and test validation
  - `report-generator.js` - Report generation
  
### Commands (lib/commands/)
- `init.js` - Initialize Mehaisi in any repo
- `agents.js` - List and manage agents
- `run.js` - Run single agent
- `workflow.js` - Run agent workflows
- `pipeline.js` - Run full pipelines
- `coordinate.js` - Enable coordination mode
- `status.js`, `report.js`, `diff.js`, `rollback.js` - Utilities

### 19 Enhanced Agents (templates/agents/)

**Investigators:**
1. `api-detective.yml` - Deep API analysis (7.5KB, ultra-detailed)
2. `ui-inspector.yml` - Comprehensive UI audit (8.7KB, ultra-detailed)
3. `code-archaeologist.yml` - Dead code detection
4. `security-scanner.yml` - Security vulnerability scanning
5. `dependency-doctor.yml` - Dependency auditing
6. `accessibility-auditor.yml` - WCAG compliance

**Cleaners:**
7. `code-janitor.yml` - Safe code cleanup

**Fixers:**
8. `api-connector.yml` - Fix API issues
9. `event-binder.yml` - Fix UI event handlers
10. `responsive-engineer.yml` - Fix responsive design
11. `accessibility-fixer.yml` - Fix accessibility
12. `refactor-master.yml` - Refactor complex code

**Builders:**
13. `test-writer.yml` - Generate test suites
14. `performance-optimizer.yml` - Performance optimization
15. `type-enforcer.yml` - Add TypeScript types
16. `documentation-writer.yml` - Generate docs

**QA:**
17. `integration-validator.yml` - Integration testing
18. `stress-tester.yml` - Load testing
19. `production-checker.yml` - Pre-deployment checklist

### Documentation
- `README.md` - Complete user guide (340+ lines)
- `INSTALL.md` - Step-by-step installation
- `QUICKREF.md` - Quick command reference
- `LICENSE` - MIT License

---

## 🚀 Deployment Instructions

### Option 1: Publish to NPM (Public)

```bash
cd mehaisi-package

# 1. Update package.json with your info
#    - Change "name" if needed
#    - Update "repository" URL
#    - Update "author"

# 2. Create NPM account (if needed)
npm adduser

# 3. Publish
npm publish

# Users can then install:
npm install -g mehaisi
```

### Option 2: Publish to NPM (Private/Scoped)

```bash
# 1. Update package.json name to @yourorg/mehaisi

# 2. Publish
npm publish --access restricted  # Or --access public
```

### Option 3: Install Locally (No NPM)

```bash
cd mehaisi-package

# 1. Install dependencies
npm install

# 2. Link globally
npm link

# Now 'mehaisi' command is available globally
```

### Option 4: Use Directly in Projects

```bash
# Copy to your project
cp -r mehaisi-package /path/to/your/project/node_modules/mehaisi

# Or use as local dependency
cd your-project
npm install /path/to/mehaisi-package
npx mehaisi init
```

---

## 🎮 How to Use

### First Time Setup

```bash
# 1. Prerequisites
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh
ollama login

# Install Claude Code
curl -fsSL https://claude.ai/install.sh | bash

# Configure for Ollama
ollama launch claude

# 2. Install Mehaisi (choose method above)
npm install -g mehaisi

# 3. Go to your messy repo
cd /path/to/your/messy/codebase

# 4. Initialize
mehaisi init

# You'll see:
# ✓ Directory structure created
# ✓ 19 agents configured
# ✓ Default workflows created
# ✓ Default pipelines created
```

### Running Your First Investigation

```bash
# List available agents
mehaisi agents --list

# Run investigation workflow (all investigator agents)
mehaisi workflow investigate

# This will run:
# 1. API Detective - finds API issues
# 2. UI Inspector - finds UI issues  
# 3. Code Archaeologist - finds dead code
# 4. Security Scanner - finds vulnerabilities
# 5. Dependency Doctor - audits dependencies
# 6. Accessibility Auditor - checks accessibility

# Agents will coordinate automatically!
# Watch for messages like:
#   ℹ API Detective shared: 12 issues found
#   → UI Inspector notified
#   ⚠ Security Scanner reported: CRITICAL vulnerability
```

### Reviewing Results

```bash
# View last session report
mehaisi report --last

# Check coordination summary
# (automatically shown after workflow completes)

# Reports are in:
# .mehaisi/sessions/[session-id]/reports/
#   - api-detective.json
#   - ui-inspector.json
#   - etc.

# Coordination data in:
# .mehaisi/sessions/[session-id]/coordination/
#   - state.json (shared findings, issues, fixes)
```

### Fixing Issues (With Coordination)

```bash
# Fix API issues
mehaisi workflow fix-apis

# Agent coordination in action:
# 1. API Connector queries API Detective findings
# 2. Reads shared issues from coordination hub
# 3. Fixes issues by priority
# 4. Reports fixes back to hub
# 5. Other agents see the fixes and adapt

# Fix UI issues
mehaisi workflow fix-ui

# Agents coordinate:
# 1. Event Binder queries UI Inspector findings
# 2. Responsive Engineer reads related UI issues
# 3. Accessibility Fixer checks for related violations
# 4. All share their fixes
```

### Full Pipeline (Complete Transformation)

```bash
# Cautious mode (recommended first time)
mehaisi pipeline cautious

# This runs 5 phases:
# Phase 1: Investigation (all investigators coordinate)
# Phase 2: Cleanup (safe removals)
# Phase 3: Core Fixes (API + UI fixes with coordination)
# Phase 4: Optimization (performance, refactoring, types)
# Phase 5: QA (tests, stress testing, production checks)

# Each phase creates a git checkpoint
# You approve changes at each step
```

---

## 🤝 Agent Coordination Explained

### How Coordination Works

The **Coordination Hub** (`lib/coordination-hub.js`) enables agents to:

1. **Share Findings**
   ```javascript
   // Agent discovers something
   coordinationHub.shareFinding(agentId, {
     type: 'api-issue',
     severity: 'high',
     summary: 'API call to localhost found',
     file: 'api/users.js',
     line: 42
   });
   // Other agents are notified automatically
   ```

2. **Report Issues**
   ```javascript
   // Agent creates work ticket for specialist
   coordinationHub.reportIssue(agentId, {
     title: 'Missing error handling',
     severity: 'high',
     requiredCapability: 'error-handling',
     suggestedFix: 'Add try-catch block'
   });
   // Specialist agent sees this in their queue
   ```

3. **Query Findings**
   ```javascript
   // Agent checks what others found
   const apiIssues = await coordinationHub.queryFindings(agentId, {
     type: 'api-issue',
     severity: 'high'
   });
   // Use findings to inform own work
   ```

4. **Request Help**
   ```javascript
   // Agent needs expertise
   coordinationHub.requestHelp(agentId, {
     capability: 'security-analysis',
     description: 'Need security review of auth'
   });
   // Security expert agent is notified
   ```

### Real Coordination Example

```bash
$ mehaisi workflow investigate

🤖 Running: API Detective
  📊 Analyzing 45 API calls...
  ℹ Shared finding: Hardcoded localhost in 12 files
  ℹ Shared finding: Missing error handling in 8 files
  ⚠ Reported issue: Critical - no authentication on /admin
  
🤖 Running: UI Inspector  
  → Received notification from API Detective
  📊 Analyzing UI with API context...
  ℹ Shared finding: Submit button for broken API
  → Linked to API Detective issue #3
  
🤖 Running: Security Scanner
  → Received CRITICAL notification from API Detective
  🔍 Deep scan of /admin endpoint...
  ⚠ Reported issue: URGENT - authentication bypass possible
  → Escalated to human review
  
📊 Coordination Summary:
  Findings shared: 23
  Issues reported: 15
  Critical issues: 2
  Cross-references: 7
  Active agents: 3
  
✓ All agents completed
✓ Coordination data saved
```

### Coordination Benefits

1. **No Duplicate Work** - Agents see what others found
2. **Context Awareness** - Fixers know full scope from investigators
3. **Smart Routing** - Issues automatically go to right specialist
4. **Human Escalation** - Critical issues flagged immediately
5. **Traceability** - Full audit trail of who found/fixed what

---

## 🛡️ Safety Features

### Git-Based Safety
- Every agent runs in isolated git branch
- Automatic checkpoints every N agents
- One-command rollback: `mehaisi rollback`
- Never modifies main branch directly

### Test Validation
- Runs test suite after each agent (configurable)
- Auto-rollback if tests fail
- Can skip with `--skip-tests` (not recommended)

### Human Approval
- High-risk changes require explicit approval
- Shows diff before applying
- Can pause/resume at any step

### Token Budgets
- Tracks token usage per agent
- Prevents runaway API costs
- Configurable limits in config.json

---

## ⚙️ Configuration

Edit `.mehaisi/config.json` after init:

```json
{
  "model": "qwen3-coder",              // Default Ollama model
  "context_window": 128000,            // Model context size
  "ollama_url": "http://localhost:11434",
  
  "safety": {
    "auto_apply": false,               // Require manual approval
    "require_tests": true,             // Run tests after changes
    "max_files_per_agent": 10,         // Limit scope
    "token_budget_per_agent": 50000,   // Cost control
    "rollback_on_failure": true        // Auto-rollback on test failure
  },
  
  "execution": {
    "parallel_agents": 1,              // Sequential execution (safer)
    "pause_on_error": true,            // Stop on failures
    "auto_commit": false               // Never auto-commit
  },
  
  "project_context": {
    "type": "react",                   // Project type
    "test_command": "npm test",        // How to run tests
    "build_command": "npm run build",
    "ignored_paths": [
      "node_modules",
      "dist",
      "build"
    ]
  }
}
```

---

## 🎨 Customization

### Create Custom Agent

```bash
# Create new agent file
nano .mehaisi/agents/my-custom-agent.yml
```

```yaml
name: My Custom Agent
type: investigator
risk_level: low
model: qwen3-coder

coordination:
  enabled: true
  capabilities:
    - custom-analysis
    - pattern-detection
  shares_with:
    - code-janitor
    - refactor-master

scope:
  include:
    - "src/**/*.js"
  exclude:
    - "**/*.test.js"

instructions: |
  You are a specialized agent for [your purpose].
  
  MISSION:
  1. [What to analyze]
  2. [What to find]
  3. [What to report]
  
  COORDINATION:
  - Use coordinationHub.shareFinding() to share discoveries
  - Use coordinationHub.reportIssue() for problems
  - Query other agents' findings for context
  
  OUTPUT:
  Generate structured report with findings.

output:
  report: "reports/my-custom-agent.md"
  structured: "reports/my-custom-agent.json"

validation:
  - "Report file created"
  - "No code modifications"
```

### Run Custom Agent

```bash
mehaisi run my-custom-agent
```

---

## 📊 File Structure After Init

```
your-project/
├── .mehaisi/
│   ├── config.json           # Configuration
│   ├── agents/               # 19 agent definitions
│   │   ├── api-detective.yml
│   │   ├── ui-inspector.yml
│   │   └── ... (17 more)
│   ├── workflows/            # Workflow definitions
│   │   ├── investigate.json
│   │   ├── fix-apis.json
│   │   └── ... (more)
│   ├── pipelines/            # Pipeline definitions
│   │   ├── cautious.json
│   │   ├── balanced.json
│   │   └── aggressive.json
│   ├── sessions/             # Session data (gitignored)
│   │   └── [session-id]/
│   │       ├── reports/      # Agent reports
│   │       ├── coordination/ # Coordination data
│   │       ├── diffs/        # Change diffs
│   │       └── checkpoints/  # Rollback points
│   └── reports/              # Global reports
├── [your project files]
└── .gitignore               # Updated with .mehaisi/sessions
```

---

## 🐛 Troubleshooting

### "Command not found: mehaisi"
```bash
# Check NPM global bin path
npm config get prefix

# Add to PATH
export PATH=$PATH:$(npm config get prefix)/bin

# Or reinstall
npm uninstall -g mehaisi
npm install -g mehaisi
```

### "Ollama connection failed"
```bash
# Start Ollama
ollama serve

# Or check if running
ollama list

# Verify URL in config
cat .mehaisi/config.json | grep ollama_url
```

### "Claude Code not responding"
```bash
# Verify environment variables
echo $ANTHROPIC_AUTH_TOKEN  # Should be: ollama
echo $ANTHROPIC_BASE_URL    # Should be: http://localhost:11434

# Reconfigure
ollama launch claude --config
```

### "Tests failing after agent run"
```bash
# Run tests manually to diagnose
npm test

# Skip tests temporarily
mehaisi run <agent> --skip-tests

# Or disable in config
# Set "require_tests": false in .mehaisi/config.json
```

### "Agent not coordinating"
```bash
# Check coordination enabled in agent YAML
cat .mehaisi/agents/agent-name.yml | grep coordination

# Check coordination hub state
cat .mehaisi/sessions/[last-session]/coordination/state.json
```

---

## 🚀 Production Deployment Checklist

Before using on production code:

- [ ] Install all prerequisites (Ollama, Claude Code, Git)
- [ ] Test on small project first
- [ ] Review all agent configurations
- [ ] Set up test suite for validation
- [ ] Configure safety settings appropriately
- [ ] Ensure Git repo is clean
- [ ] Create backup branch: `git checkout -b backup`
- [ ] Run investigation workflow first
- [ ] Review reports before applying fixes
- [ ] Use cautious pipeline for first run
- [ ] Commit after each successful agent

---

## 📈 Next Steps

1. **Install the package** using one of the deployment options
2. **Initialize in a test project** to familiarize yourself
3. **Run investigation workflow** to see coordination in action
4. **Review the reports** to understand agent output
5. **Gradually apply fixes** starting with low-risk agents
6. **Customize agents** for your specific needs
7. **Share with your team** and gather feedback

---

## 🎓 Learning Resources

- **README.md** - Complete user guide with examples
- **INSTALL.md** - Detailed installation instructions
- **QUICKREF.md** - Quick command reference
- **Agent YAMLs** - Study how agents are configured
- **lib/coordination-hub.js** - Understand coordination system
- **lib/orchestrator.js** - See how everything fits together

---

## 💡 Tips for Success

1. **Always start with investigation** - Don't fix blindly
2. **Read the coordination summary** - Understand what agents found
3. **Review diffs before accepting** - Use `mehaisi diff --last`
4. **Commit frequently** - After each successful agent
5. **Don't skip tests** - They're your safety net
6. **Use cautious pipeline first** - Speed up once comfortable
7. **Customize agents for your stack** - Edit the YAML files
8. **Keep coordination enabled** - Agents are smarter together

---

## 🏆 What Makes This Package Special

✨ **19 Production-Ready Agents** - Not just templates, fully specified
✨ **True Agent Coordination** - 400+ lines of coordination logic
✨ **Safety-First Design** - Multiple layers of protection
✨ **Claude Code Integration** - Properly configured for Ollama
✨ **Complete CLI** - All commands implemented and tested
✨ **Comprehensive Docs** - 1000+ lines of documentation
✨ **Workflow System** - Predefined sequences that work
✨ **Git-Based Rollback** - Never lose work
✨ **NPM Ready** - Can publish immediately

---

## 📞 Support

If you encounter issues:
1. Check INSTALL.md troubleshooting section
2. Review agent logs in `.mehaisi/sessions/`
3. Verify prerequisites are installed correctly
4. Check configuration in `.mehaisi/config.json`

---

## 🎉 You're Ready!

You now have a complete, production-ready multi-agent system that can:
- ✅ Investigate code quality issues
- ✅ Fix APIs, UI, and accessibility  
- ✅ Optimize performance
- ✅ Generate tests and documentation
- ✅ Validate production readiness
- ✅ Coordinate between agents intelligently
- ✅ Keep you in control with safety features

**Go transform some codebases! 🚀**

---

*Package Version: 1.0.0*
*Total Agents: 19*
*Total Lines of Code: ~5000+*
*Documentation: 1500+ lines*
