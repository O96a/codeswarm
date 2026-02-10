/**
 * Model Resolver
 * 
 * Handles intelligent model selection with proper priority and fallback logic.
 * Ensures consistency across all agents while allowing per-agent overrides.
 */

const chalk = require('chalk');

class ModelResolver {
  constructor(config) {
    this.config = config;
    this.globalModel = config.model;
    this.providers = config.llm?.providers || {};
    this.defaultProvider = config.llm?.default_provider;
  }

  /**
   * Resolve which model to use for an agent
   * 
   * Priority (highest to lowest):
   * 1. Runtime override (options.model)
   * 2. Global model from config (set during init)
   * 3. Agent-specific model (from agent YAML)
   * 4. Provider's default model
   * 
   * @param {Object} agentConfig - Agent configuration from YAML
   * @param {Object} options - Runtime options
   * @returns {string} The model to use
   */
  resolve(agentConfig, options = {}) {
    const model = options.model || this.globalModel || agentConfig.model;
    
    if (!model) {
      throw new Error('No model specified. Set model in config or provide --model option.');
    }

    return model;
  }

  /**
   * Resolve which provider to use for a model
   * 
   * Priority:
   * 1. Explicit provider from agent config
   * 2. Provider override from options
   * 3. Default provider from config
   * 4. Auto-detect from model name
   * 
   * @param {Object} agentConfig - Agent configuration
   * @param {Object} options - Runtime options
   * @returns {string} The provider name
   */
  resolveProvider(agentConfig, options = {}) {
    // Explicit provider override
    if (options.provider) return options.provider;
    if (agentConfig.provider) return agentConfig.provider;
    
    // Use default from config
    if (this.defaultProvider) return this.defaultProvider;
    
    // Auto-detect based on model name
    const model = this.resolve(agentConfig, options);
    return this.autoDetectProvider(model);
  }

  /**
   * Auto-detect provider based on model name patterns
   * 
   * @param {string} model - Model name
   * @returns {string} Provider name
   */
  autoDetectProvider(model) {
    if (model.includes(':cloud')) return 'ollama-cloud';
    if (model.includes(':local')) return 'ollama-local';
    if (model.includes('claude')) return 'claude-code';
    if (model.includes('gpt-') || model.includes('openai')) return 'openai';
    
    // Default to ollama-cloud for unknown models
    return 'ollama-cloud';
  }

  /**
   * Validate model compatibility with provider
   * 
   * @param {string} model - Model name
   * @param {string} provider - Provider name
   * @returns {Object} {valid: boolean, warning?: string}
   */
  validateCompatibility(model, provider) {
    const providerConfig = this.providers[provider];
    
    if (!providerConfig) {
      return {
        valid: false,
        warning: `Provider '${provider}' not configured. Check .mehaisi/config.json`
      };
    }

    // Check if model matches provider type
    const warnings = [];
    
    if (provider === 'ollama-cloud' && !model.includes(':cloud')) {
      warnings.push(`Model '${model}' may not be available on Ollama Cloud. Consider using ':cloud' suffix.`);
    }
    
    if (provider === 'ollama-local' && model.includes(':cloud')) {
      warnings.push(`Model '${model}' is marked as cloud but using local provider. Remove ':cloud' suffix for local models.`);
    }
    
    if (provider === 'claude-code' && !process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN) {
      warnings.push(`Claude Code requires CLAUDE_CODE_SESSION_ACCESS_TOKEN environment variable.`);
    }

    return {
      valid: warnings.length === 0,
      warnings
    };
  }

  /**
   * Get execution context with resolved model and provider
   * 
   * @param {Object} agentConfig - Agent configuration
   * @param {Object} options - Runtime options
   * @returns {Object} Execution context
   */
  getExecutionContext(agentConfig, options = {}) {
    const model = this.resolve(agentConfig, options);
    const provider = this.resolveProvider(agentConfig, options);
    const validation = this.validateCompatibility(model, provider);

    // Log warnings if any
    if (validation.warnings && validation.warnings.length > 0) {
      validation.warnings.forEach(warning => {
        console.log(chalk.yellow(`⚠ ${warning}`));
      });
    }

    return {
      model,
      provider,
      valid: validation.valid,
      warnings: validation.warnings || [],
      source: this.getSource(agentConfig, options)
    };
  }

  /**
   * Get the source of the model selection for debugging
   * 
   * @param {Object} agentConfig - Agent configuration
   * @param {Object} options - Runtime options
   * @returns {string} Description of where the model came from
   */
  getSource(agentConfig, options = {}) {
    if (options.model) return 'runtime-override';
    if (this.globalModel) return 'global-config';
    if (agentConfig.model) return 'agent-default';
    return 'provider-default';
  }

  /**
   * Get all available models from configured providers
   * 
   * @returns {Object} Map of provider -> models
   */
  getAvailableModels() {
    const models = {};
    
    for (const [name, config] of Object.entries(this.providers)) {
      if (config.model) {
        if (!models[name]) models[name] = [];
        models[name].push(config.model);
      }
      if (config.supportedModels) {
        if (!models[name]) models[name] = [];
        models[name].push(...config.supportedModels);
      }
    }
    
    return models;
  }

  /**
   * Display model resolution information (for debugging)
   * 
   * @param {Object} agentConfig - Agent configuration
   * @param {Object} options - Runtime options
   */
  displayResolutionInfo(agentConfig, options = {}) {
    const context = this.getExecutionContext(agentConfig, options);
    
    console.log(chalk.blue('\n🎯 Model Resolution:'));
    console.log(chalk.white(`  Model: ${chalk.bold(context.model)}`));
    console.log(chalk.white(`  Provider: ${chalk.bold(context.provider)}`));
    console.log(chalk.white(`  Source: ${chalk.dim(context.source)}`));
    
    if (agentConfig.name) {
      console.log(chalk.white(`  Agent: ${chalk.dim(agentConfig.name)}`));
    }
    
    console.log();
  }
}

module.exports = ModelResolver;
