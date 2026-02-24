# Manual Testing Guide for Mehaisi CodeSwarm on Terab Project

## Prerequisites Check

Before starting, verify you have:
```bash
# 1. Check Node.js version
node --version  # Should be v24.13.0 or higher

# 2. Check Git
git --version

# 3. Check current directory
pwd  # Should be in ~/projects/terab or navigate there
cd ~/projects/terab

# 4. Verify terab is a git repository
git status  # Should show repo status, not "not a git repository"
```

## Step-by-Step Testing Guide

### Phase 1: Fresh Installation & Setup

#### 1.1 Pull Latest Mehaisi CodeSwarm Changes
```bash
cd ~/codeswarm
git pull origin main
npm install  # Install any new dependencies (boxen)
```

#### 1.2 Verify Link
```bash
which mehaisi
# Should show: /usr/local/bin/codeswarm or similar

codeswarm --version
# Should show version number
```

#### 1.3 Initialize Terab Project
```bash
cd ~/projects/terab

# If already initialized, remove old config to test fresh
rm -rf .mehaisi

# Initialize with Ollama Cloud model
codeswarm init --model kimi-k2.5:cloud
```

**Expected Output:**
```
🚀 INITIALIZING MEHAISI
────────────────────────────────────────────────────────────
✔ Initialization complete

Configuration
  • 19 agents configured
  • Workflows & pipelines ready
  • Model: kimi-k2.5:cloud
  • Provider: ollama-cloud

🎯 Get Started
  1. codeswarm credentials · Setup API keys
  2. codeswarm agents --list · View available agents
  3. codeswarm pipeline cautious · Run full pipeline
```

**What to Check:**
- ✓ Clean, modern formatting
- ✓ No emoji overload
- ✓ Point-based lists with bullets
- ✓ Proper spacing (no gaps)
- ✓ Shows correct model and provider

---

### Phase 2: Credential Manager Testing

#### 2.1 Test Interactive Credential Setup
```bash
cd ~/projects/terab

# Run credential setup (the new interactive feature!)
codeswarm credentials
```

**Expected Prompt:**
```
🔐 SETTING UP CREDENTIALS
────────────────────────────────────────────────────────────

Provider: ollama-cloud

⚠ Ollama Cloud API key not found
ℹ Get your API key from: https://ollama.com

? Enter your Ollama Cloud API key: [type here]
```

**When Prompted:**
1. Enter your API key: `59064537a0604b5fa23d0f2c9a4cd0a2.OS7nVy9sUJAYhlLOwpOBWgM6`
2. When asked "Save to config?": Choose `Yes`

**Expected Result:**
```
✓ API key saved to config

✓ Credential setup complete
```

**What to Check:**
- ✓ Modern header with divider
- ✓ Clean warning/info messages
- ✓ Password is hidden as you type
- ✓ Confirms save to config
- ✓ No ugly gaps or spacing issues

#### 2.2 Verify Credentials Were Saved
```bash
cat .mehaisi/config.json | grep api_key
```

**Expected Output:**
```
        "api_key": "59064537a0604b5fa23d0f2c9a4cd0a2.OS7nVy9sUJAYhlLOwpOBWgM6",
```

---

### Phase 3: UI Enhancement Testing

#### 3.1 Test Status Command
```bash
codeswarm status
```

**Expected Output:**
```
⚙ SYSTEM STATUS
────────────────────────────────────────────────────────────

Configuration
  Model: kimi-k2.5:cloud
  Provider: ollama-cloud
  Safety Mode: Manual approval
  Agents: 19
  Sessions: 0
```

**What to Check:**
- ✓ Professional header
- ✓ Key-value pairs properly aligned
- ✓ Clean divider line
- ✓ No extra newlines or gaps

#### 3.2 Test Agents List Command
```bash
codeswarm agents --list
```

**Expected Output:**
```
⚙ AVAILABLE AGENTS
────────────────────────────────────────────────────────────

INVESTIGATOR
┌───────────────────────┬──────┬────────────────────────────┐
│ Agent                 │ Risk │ Capabilities               │
├───────────────────────┼──────┼────────────────────────────┤
│ Accessibility Auditor │ low  │ accessibility, a11y-c...   │
│ API Detective         │ low  │ api-integration, endpo...  │
...
└───────────────────────┴──────┴────────────────────────────┘

FIXER
...

────────────────────────────────
Total: 19 agents configured
```

**What to Check:**
- ✓ Beautiful Unicode box-drawing (┌─┐ not ugly ASCII)
- ✓ Color-coded risk levels (green for low, yellow for medium, red for high)
- ✓ Grouped by agent type
- ✓ Clean table formatting
- ✓ Professional appearance

---

### Phase 4: Model Selection Testing

#### 4.1 Verify Model Configuration
```bash
cat .mehaisi/config.json | head -30
```

**What to Check:**
- ✓ `"model": "kimi-k2.5:cloud"` at the top
- ✓ `"default_provider": "ollama-cloud"`
- ✓ Provider configs have the model set correctly

#### 4.2 Test Model Override (Optional)
```bash
# This tests that your global model overrides agent defaults
codeswarm run api-detective --dry-run 2>&1 | grep -i model
```

**Expected Behavior:**
- Should use `kimi-k2.5:cloud` (your global model)
- NOT `qwen3-coder` (the old agent default)

---

### Phase 5: Full Pipeline Test

#### 5.1 Run a Real Pipeline
```bash
cd ~/projects/terab

# Run the cautious pipeline (safest, read-only investigations)
codeswarm pipeline cautious
```

**Expected Output:**
```
🚀 INITIALIZING MEHAISI SESSION
────────────────────────────────────────────────────────────
✔ Pre-flight checks passed
✓ Session ID: [uuid]

🚀 PIPELINE: CAUTIOUS
────────────────────────────────────────────────────────────

 Investigation 

Workflow: investigate
────────────────────────────────────────────────────────────
  • API Analysis

▶ API Detective
  • Executing...
✔ Agent completed

  • UI Analysis

▶ UI Inspector
  • Executing...
✔ Agent completed

...
```

**What to Check:**
- ✓ Clean headers with icons
- ✓ Phase banners with inverse background
- ✓ Point-based workflow steps
- ✓ Agent execution shows progress
- ✓ No credential prompts (already saved!)
- ✓ Professional, modern output throughout
- ✓ No ugly gaps or formatting issues

**This Will:**
1. Scan your terab codebase
2. Find API issues, UI problems, security vulnerabilities
3. Create a session report
4. NOT modify any code (cautious pipeline is read-only)

#### 5.2 Check Results
```bash
# View the most recent session report
codeswarm report --last
```

**Expected Output:**
- Session summary with findings
- List of issues discovered
- Agent performance metrics

---

### Phase 6: Credential Persistence Testing

#### 6.1 Test That You're NOT Prompted Again
```bash
cd ~/projects/terab

# Run another command - should NOT ask for credentials
codeswarm run security-scanner
```

**Expected Behavior:**
- ✓ Runs immediately without prompting
- ✓ Uses saved credentials from config
- ✓ Smooth, uninterrupted execution

#### 6.2 Test Credential Removal & Re-prompt
```bash
# Remove saved credentials
cat .mehaisi/config.json | grep -v "api_key" > /tmp/config-temp.json
mv /tmp/config-temp.json .mehaisi/config.json

# Run again - should prompt this time
codeswarm run api-detective
```

**Expected Behavior:**
- ✓ Detects missing credentials
- ✓ Prompts you interactively
- ✓ Gives you option to save again

**After Testing:**
```bash
# Save credentials again when prompted
# Or restore manually:
codeswarm credentials
```

---

### Phase 7: Edge Case Testing

#### 7.1 Test Invalid Credentials
```bash
# Temporarily set wrong API key
export OLLAMA_CLOUD_API_KEY="invalid-key-12345"

codeswarm run api-detective
```

**Expected Output:**
- ✓ Clear error message about authentication failure
- ✓ Suggests checking your API key
- ✓ Doesn't crash or hang

**Clean up:**
```bash
unset OLLAMA_CLOUD_API_KEY
```

#### 7.2 Test Without Network (Optional)
```bash
# This tests graceful failure
# Temporarily block network or disconnect

codeswarm run api-detective
```

**Expected Behavior:**
- ✓ Times out gracefully
- ✓ Shows clear error message
- ✓ Doesn't hang indefinitely

---

## What Success Looks Like

After completing all tests, you should have:

✅ **Clean Installation**
- Fresh `.mehaisi` directory in terab project
- Config file with `kimi-k2.5:cloud` model
- Ollama Cloud provider selected

✅ **Working Credentials**
- API key saved in config
- Never prompted multiple times
- Smooth execution without manual exports

✅ **Modern UX**
- Beautiful Unicode tables
- Clean headers with dividers
- Point-based lists
- No formatting gaps
- Color-coded output
- Professional appearance

✅ **Functional Pipeline**
- Runs investigations on terab codebase
- Agents execute successfully
- Session reports generated
- No crashes or hangs

✅ **Smart Model Selection**
- Your chosen model used everywhere
- Agent defaults overridden correctly
- Provider auto-selected based on model

---

## Troubleshooting

### Issue: "mehaisi: command not found"
```bash
cd ~/codeswarm
sudo npm link
```

### Issue: "Cannot find module 'boxen'"
```bash
cd ~/codeswarm
npm install boxen --save
```

### Issue: Credentials not being saved
```bash
# Check file permissions
ls -la .mehaisi/config.json
# Should be writable

# Manually verify save
cat .mehaisi/config.json | grep api_key
```

### Issue: Agent fails with model error
```bash
# Check your model is set correctly
cat .mehaisi/config.json | grep model

# Verify provider
cat .mehaisi/config.json | grep default_provider
```

### Issue: Old formatting still showing
```bash
# Make sure you have latest code
cd ~/codeswarm
git pull origin main
npm install
sudo npm link
```

---

## Quick Smoke Test (2 Minutes)

If you just want to quickly verify everything works:

```bash
# 1. Navigate to terab
cd ~/projects/terab

# 2. Initialize
rm -rf .codeswarm && codeswarm init --model kimi-k2.5:cloud

# 3. Setup credentials
codeswarm credentials
# Enter: 59064537a0604b5fa23d0f2c9a4cd0a2.OS7nVy9sUJAYhlLOwpOBWgM6
# Choose: Yes (save to config)

# 4. Check status
codeswarm status

# 5. List agents
codeswarm agents --list

# 6. Run one agent
codeswarm run api-detective

# Done! If these all work with clean output, you're good!
```

---

## Summary Checklist

Use this to track your testing progress:

- [ ] Pulled latest code from GitHub
- [ ] Installed dependencies (boxen)
- [ ] Initialized terab project
- [ ] Tested interactive credential prompt
- [ ] Verified credentials saved to config
- [ ] Checked status command (modern UI)
- [ ] Checked agents list (Unicode tables)
- [ ] Verified model selection (global overrides)
- [ ] Ran full cautious pipeline
- [ ] Verified no re-prompting for credentials
- [ ] Tested credential removal and re-prompt
- [ ] All output is clean, modern, professional

---

## Need Help?

If you encounter any issues:

1. Check `~/.mehaisi/temp/` for error logs
2. Run with verbose mode: `MEHAISI_VERBOSE=1 codeswarm [command]`
3. Check the guides:
   - [CREDENTIALS_GUIDE.md](CREDENTIALS_GUIDE.md)
   - [MODEL_SELECTION_GUIDE.md](MODEL_SELECTION_GUIDE.md)
   - [UX_ENHANCEMENTS.md](UX_ENHANCEMENTS.md)

Good luck with your testing! 🚀
