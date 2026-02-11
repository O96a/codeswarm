# Installation Guide

## Prerequisites

### 1. Install Node.js (v16+)
```bash
# Check if installed
node --version

# If not installed:
# - Visit https://nodejs.org
# - Or use nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
```

### 2. Install Ollama
```bash
# Linux/macOS
curl -fsSL https://ollama.com/install.sh | sh

# Verify installation
ollama --version

# Login to Ollama (for cloud models)
ollama login

# Pull recommended model (optional, can run in cloud)
ollama pull qwen3-coder
```

### 3. Install Claude Code
```bash
# Linux/macOS
curl -fsSL https://claude.ai/install.sh | bash

# Verify installation
claude --version
```

### 4. Configure Claude Code for Ollama

Quick setup:
```bash
ollama launch claude
```

Or manual setup:
```bash
export ANTHROPIC_AUTH_TOKEN=ollama
export ANTHROPIC_API_KEY=""
export ANTHROPIC_BASE_URL=http://localhost:11434
```

Add to your ~/.bashrc or ~/.zshrc to make permanent:
```bash
echo 'export ANTHROPIC_AUTH_TOKEN=ollama' >> ~/.bashrc
echo 'export ANTHROPIC_API_KEY=""' >> ~/.bashrc
echo 'export ANTHROPIC_BASE_URL=http://localhost:11434' >> ~/.bashrc
source ~/.bashrc
```

## Install Mehaisi

### Global Installation (Recommended)
```bash
npm install -g mehaisi
```

### Local Installation (Per Project)
```bash
npm install --save-dev mehaisi
# Run via npx mehaisi
```

### From Source
```bash
git clone https://github.com/O96a/mehaisi.git
cd mehaisi
npm install
npm link
```

## Verify Installation

```bash
# Check Mehaisi
mehaisi --version

# Check prerequisites
git --version
ollama --version
claude --version
```

## Initialize Your First Project

```bash
cd your-project
mehaisi init

# You should see:
# ✓ 19 agents configured
# ✓ Default workflows created
# ✓ Default pipelines created
```

## Test Run

```bash
# List agents
mehaisi agents --list

# Run a safe investigator agent
mehaisi run api-detective

# Check status
mehaisi status
```

## Troubleshooting

### "command not found: mehaisi"
- Ensure npm global bin is in PATH: `npm config get prefix`
- Add to PATH: `export PATH=$PATH:$(npm config get prefix)/bin`

### "Ollama connection failed"
- Check Ollama is running: `ollama list`
- Verify URL in config: `.mehaisi/config.json`
- Try: `ollama serve` then retry

### "Claude Code not found"
- Reinstall: `curl -fsSL https://claude.ai/install.sh | bash`
- Check PATH includes Claude Code installation directory
- Verify environment variables are set

### "Permission denied"
- Use sudo for global install: `sudo npm install -g mehaisi`
- Or configure npm prefix: `npm config set prefix ~/.npm-global`

## Next Steps

1. Read the README.md for usage examples
2. Run `mehaisi workflow investigate` on your project
3. Review the generated reports in `.mehaisi/sessions/`
4. Customize agents in `.mehaisi/agents/`

## Getting Help

- GitHub Issues: https://github.com/O96a/mehaisi/issues
- Documentation: README.md
- Agent Customization: See templates/agents/
