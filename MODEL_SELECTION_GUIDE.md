# Model Selection Guide

This guide explains how Mehaisi handles model selection and provider routing.

## Overview

Mehaisi uses a **ModelResolver** system that intelligently selects the appropriate model and provider for each agent execution. This ensures consistency while allowing flexibility when needed.

## Model Selection Priority

The system follows a clear priority hierarchy (highest to lowest):

```
1. Runtime Override    → mehaisi run agent --model <model>
2. Global Config       → mehaisi init --model <model>
3. Agent Default       → model: ... in agent YAML
4. Provider Default    → From provider configuration
```

### Examples

```bash
# Set global model during initialization
mehaisi init --model kimi-k2.5:cloud

# All agents will use kimi-k2.5:cloud by default

# Override for a specific run
mehaisi run api-detective --model qwen3-coder

# This agent will use qwen3-coder, others still use kimi-k2.5:cloud
```

## Provider Selection

Providers are automatically selected based on your model choice:

| Model Pattern | Provider | Authentication Required |
|--------------|----------|------------------------|
| `*:cloud` | `ollama-cloud` | `OLLAMA_CLOUD_API_KEY` |
| `*:local` | `ollama-local` | None (local Ollama) |
| `claude*` | `claude-code` | `CLAUDE_CODE_SESSION_ACCESS_TOKEN` |
| `gpt-*` | `openai` | `OPENAI_API_KEY` |
| Other | `ollama-cloud` | `OLLAMA_CLOUD_API_KEY` |

### Provider Configuration

Edit `.mehaisi/config.json` to configure providers:

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
        "api_key": "your-key-here",
        "priority": 1
      },
      "ollama-local": {
        "type": "ollama",
        "url": "http://localhost:11434",
        "model": "kimi-k2.5",
        "priority": 2,
        "fallback": true
      }
    }
  }
}
```

## Agent-Specific Model Overrides

Individual agents can specify their preferred model in their YAML file:

```yaml
name: API Detective
type: investigator
risk_level: low
model: qwen3-coder  # Optional: Override global model for this agent
priority: 1
```

**Note:** Agent-specific models are **optional** and have lower priority than your global config. Leave them commented out to use your configured model.

## Authentication

Mehaisi provides an **interactive credentials setup** command that prompts you for API keys when needed, instead of requiring manual environment variable exports.

### Quick Setup (Recommended)

```bash
# After initialization, run the credentials command
mehaisi credentials

# This will interactively prompt for any missing API keys
# and optionally save them to your config file
```

### Ollama Cloud

**Option 1: Interactive Setup (Recommended)**
```bash
mehaisi credentials
# When prompted, enter your API key
# Choose whether to save it to config
```

**Option 2: Environment Variable**
```bash
export OLLAMA_CLOUD_API_KEY="your-api-key-here"
```

**Option 3: Config File**
Edit `.mehaisi/config.json`:
```json
{
  "llm": {
    "providers": {
      "ollama-cloud": {
        "api_key": "your-api-key-here"
      }
    }
  }
}
```

**No manual exports needed!** When you run any command that requires an API key, Mehaisi will automatically prompt you if it's missing.

### Ollama Local

```bash
# Start Ollama server
ollama serve

# Pull your model
ollama pull kimi-k2.5
```

### Claude Code

```bash
export CLAUDE_CODE_SESSION_ACCESS_TOKEN="your-session-token"
```

## Model Validation

The ModelResolver performs compatibility checks:

- ✅ Cloud models with cloud provider
- ✅ Local models with local provider
- ⚠️  Warns about mismatches (e.g., `:cloud` suffix with local provider)
- ⚠️  Warns about missing authentication

Enable verbose mode to see resolution details:

```bash
export MEHAISI_VERBOSE=1
mehaisi run api-detective
```

Output:
```
🎯 Model Resolution:
  Model: kimi-k2.5:cloud
  Provider: ollama-cloud
  Source: global-config
  Agent: API Detective
```

## Common Scenarios

### Scenario 1: Use Ollama Cloud for Everything

```bash
mehaisi init --model kimi-k2.5:cloud
export OLLAMA_CLOUD_API_KEY="your-key"
mehaisi pipeline cautious
```

All agents use `kimi-k2.5:cloud` via Ollama Cloud.

### Scenario 2: Use Local Ollama

```bash
# Start Ollama
ollama serve

# Initialize with local model
mehaisi init --model kimi-k2.5:local

# Run without API keys
mehaisi pipeline balanced
```

### Scenario 3: Mixed Usage

```bash
# Use cloud by default
mehaisi init --model kimi-k2.5:cloud
export OLLAMA_CLOUD_API_KEY="your-key"

# Override for specific agents
mehaisi run code-janitor --model qwen3-coder:local
```

### Scenario 4: Per-Agent Models

Edit `.mehaisi/agents/api-detective.yml`:

```yaml
name: API Detective
model: specialized-api-model:cloud  # This agent uses a special model
```

All other agents use your global config model.

## Troubleshooting

### "Provider not found" Error

Check your config has the provider defined:
```bash
cat .mehaisi/config.json | grep -A 5 providers
```

### 401 Unauthorized

Set the appropriate API key:
```bash
export OLLAMA_CLOUD_API_KEY="your-key"
```

### "Model not found" Error

The model isn't available on your provider. Either:
1. Use a different model
2. Check model name spelling
3. Pull the model locally (`ollama pull model-name`)

### Wrong Model Being Used

Check resolution with verbose mode:
```bash
export MEHAISI_VERBOSE=1
mehaisi run agent-name
```

## Best Practices

1. **Set global model at init** - Ensures consistency
2. **Use model naming conventions** - `:cloud` and `:local` suffixes help routing
3. **Avoid agent-specific models** - Unless there's a specific reason
4. **Set environment variables** - More secure than config file
5. **Check compatibility** - Use `MEHAISI_VERBOSE=1` to verify settings

## Advanced: Custom Providers

Add custom providers to config:

```json
{
  "llm": {
    "providers": {
      "my-custom-provider": {
        "type": "ollama",
        "url": "https://my-ollama-instance.com",
        "model": "my-custom-model",
        "api_key": "my-key",
        "priority": 1
      }
    }
  }
}
```

## Summary

The ModelResolver provides:

✅ **Consistent** - One model choice affects all agents  
✅ **Flexible** - Override when needed  
✅ **Validated** - Warns about misconfigurations  
✅ **Transparent** - Verbose mode shows decisions  
✅ **Secure** - Supports multiple authentication methods  

For questions, check the [main documentation](README.md) or open an issue.
