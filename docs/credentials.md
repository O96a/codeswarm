# Credential Management

Mehaisi CodeSwarm provides intelligent credential management that automatically prompts you for API keys when needed, eliminating the need to manually export environment variables.

## Quick Start

### 1. Initialize Your Project

```bash
cd your-project
codeswarm init --model kimi-k2.5:cloud
```

### 2. Setup Credentials (Interactive)

```bash
codeswarm credentials
```

This command will:
- ✅ Detect which providers need credentials
- ✅ Prompt you for missing API keys
- ✅ Optionally save keys to config file
- ✅ Validate credentials work

Example session:
```
🔐 Setting up credentials for configured providers

Provider: ollama-cloud

⚠  Ollama Cloud API key not found
  You can get an API key from: https://ollama.com

? Enter your Ollama Cloud API key: ****************************************
? Save API key to config file (.mehaisi/config.json)? Yes
✓ API key saved to config

✓ Credential setup complete
```

### 3. Run Commands Without Manual Exports

```bash
# No export needed! Just run your command
codeswarm pipeline cautious

# If credentials are missing, you'll be prompted automatically
```

## How It Works

### Automatic Prompting

When you run any command that requires credentials:

1. **Check environment variables** first (e.g., `OLLAMA_CLOUD_API_KEY`)
2. **Check config file** for saved credentials
3. **Prompt interactively** if credentials not found
4. **Cache in memory** for the session

You're **never blocked** - Mehaisi CodeSwarm will always ask when it needs something.

### Credential Priority

```
1. Environment Variable  → export OLLAMA_CLOUD_API_KEY="..."
2. Config File          → .mehaisi/config.json
3. Interactive Prompt   → Asks you when needed
```

## Commands

### Setup All Credentials

```bash
# Interactively setup credentials for all providers
codeswarm credentials
```

### Per-Provider Setup

Credentials are requested automatically when you use a provider:

```bash
# First time running with ollama-cloud
codeswarm run api-detective

# You'll be prompted:
⚠  Ollama Cloud API key not found
? Enter your Ollama Cloud API key: 
```

## Storage Options

### Option 1: Save to Config (Convenient)

When prompted, choose **Yes** to save to config:

```
? Save API key to config file (.mehaisi/config.json)? Yes
✓ API key saved to config
```

**Pros:**
- ✅ Never prompted again
- ✅ Persists across sessions
- ✅ Project-specific

**Cons:**
- ⚠️  Stored in plain text
- ⚠️  Don't commit config to git with keys

### Option 2: Environment Variable (Secure)

Set once per session:

```bash
export OLLAMA_CLOUD_API_KEY="your-key-here"
codeswarm pipeline cautious
```

**Pros:**
- ✅ Not stored in files
- ✅ More secure
- ✅ Easy to rotate

**Cons:**
- ⚠️  Must export in each terminal session

### Option 3: Neither (Manual Each Time)

Choose **No** when prompted:

```
? Save API key to config file (.mehaisi/config.json)? No
💡 Tip: Set OLLAMA_CLOUD_API_KEY environment variable to avoid this prompt
```

You'll be prompted every time the credential is needed.

## Provider-Specific Setup

### Ollama Cloud

Get API key from: https://ollama.com

```bash
codeswarm credentials
# Or manually:
export OLLAMA_CLOUD_API_KEY="your-key-here"
```

### Ollama Local

No credentials needed! Just start Ollama:

```bash
ollama serve
```

### Claude Code

```bash
export CLAUDE_CODE_SESSION_ACCESS_TOKEN="your-token"
```

### OpenAI (if configured)

Get API key from: https://platform.openai.com/api-keys

```bash
codeswarm credentials
# Or manually:
export OPENAI_API_KEY="sk-..."
```

## Security Best Practices

### ✅ Do

- Use environment variables in production
- Add `.mehaisi/config.json` to `.gitignore` (auto-added during init)
- Rotate keys regularly
- Use the `credentials` command to setup keys securely

### ❌ Don't

- Commit API keys to git
- Share config files with credentials
- Store credentials in code
- Use production keys in development

## Troubleshooting

### "API key not found" every time

Make sure you either:
1. Chose "Yes" when prompted to save to config, or
2. Set environment variable in your shell profile:

```bash
# Add to ~/.bashrc or ~/.zshrc
export OLLAMA_CLOUD_API_KEY="your-key"
```

### Saved credential not working

Check the config file:

```bash
cat .mehaisi/config.json | grep api_key
```

If missing, run `codeswarm credentials` again.

### Want to change saved credential

Edit `.mehaisi/config.json` or run:

```bash
codeswarm credentials  # Re-enter when prompted
```

### 401 Unauthorized after setup

Your API key may be invalid. Verify:
1. Key is correct (no extra spaces)
2. Key hasn't expired
3. You have access to the model you're trying to use

## Migration from Manual Exports

If you've been manually exporting keys:

### Before
```bash
# Required before every command ❌
export OLLAMA_CLOUD_API_KEY="key"
export CLAUDE_CODE_SESSION_ACCESS_TOKEN="token"
codeswarm pipeline cautious
```

### After
```bash
# One-time setup ✅
codeswarm credentials

# Then just run commands
codeswarm pipeline cautious
codeswarm run api-detective
codeswarm workflow investigate
```

## Summary

✅ **No more manual exports** - Credentials are managed automatically  
✅ **Interactive prompts** - You're asked when something is needed  
✅ **Multiple storage options** - Choose what works for you  
✅ **Secure by default** - Config files are gitignored  
✅ **Provider-agnostic** - Works with all configured providers  

Just run `codeswarm credentials` once and you're ready to go!
