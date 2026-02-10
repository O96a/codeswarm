/**
 * Credential Manager
 * 
 * Handles API key and authentication credential collection, validation, and storage.
 * Prompts users interactively when credentials are missing.
 */

const fs = require('fs-extra');
const path = require('path');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ui = require('./ui-formatter');

class CredentialManager {
  constructor(configPath) {
    this.configPath = configPath;
    this.config = null;
  }

  /**
   * Load configuration from file
   */
  async loadConfig() {
    if (!this.config && await fs.pathExists(this.configPath)) {
      this.config = await fs.readJSON(this.configPath);
    }
    return this.config;
  }

  /**
   * Save configuration to file
   */
  async saveConfig(config) {
    await fs.writeJSON(this.configPath, config, { spaces: 2 });
    this.config = config;
  }

  /**
   * Get provider credentials with interactive prompting if missing
   * 
   * @param {string} providerName - Name of the provider
   * @param {Object} providerConfig - Provider configuration
   * @returns {Object} Credentials object
   */
  async getProviderCredentials(providerName, providerConfig) {
    const credentials = {};

    switch (providerConfig.type) {
      case 'ollama':
        if (providerConfig.url.includes('api.ollama.com') || providerName === 'ollama-cloud') {
          credentials.apiKey = await this.getOllamaCloudKey(providerConfig);
        }
        break;

      case 'claude-cli':
        credentials.sessionToken = await this.getClaudeSessionToken();
        break;

      case 'openai':
        credentials.apiKey = await this.getOpenAIKey(providerConfig);
        break;

      default:
        // No credentials needed
        break;
    }

    return credentials;
  }

  /**
   * Get Ollama Cloud API key from environment, config, or prompt
   */
  async getOllamaCloudKey(providerConfig) {
    // Check environment first
    if (process.env.OLLAMA_CLOUD_API_KEY) {
      return process.env.OLLAMA_CLOUD_API_KEY;
    }
    if (process.env.OLLAMA_API_KEY) {
      return process.env.OLLAMA_API_KEY;
    }

    // Check config
    if (providerConfig.api_key) {
      return providerConfig.api_key;
    }

    // Prompt user
    ui.warning('Ollama Cloud API key not found', true);
    ui.info('Get your API key from: https://ollama.com', true);
    console.log('');

    const { apiKey, saveToConfig } = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your Ollama Cloud API key:',
        mask: '*',
        validate: (input) => {
          if (!input || input.trim() === '') {
            return 'API key cannot be empty';
          }
          return true;
        }
      },
      {
        type: 'confirm',
        name: 'saveToConfig',
        message: 'Save API key to config file (.mehaisi/config.json)?',
        default: true
      }
    ]);

    // Save to config if requested
    if (saveToConfig) {
      await this.saveApiKeyToConfig('ollama-cloud', apiKey.trim());
      ui.success('API key saved to config', true);
      console.log('');
    } else {
      ui.info('Tip: Set OLLAMA_CLOUD_API_KEY environment variable', true);
      console.log('');
    }

    return apiKey.trim();
  }

  /**
   * Get Claude Code session token
   */
  async getClaudeSessionToken() {
    // Check environment
    if (process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN) {
      return process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN;
    }

    // Prompt user
    ui.warning('Claude Code session token not found', true);
    ui.info('Follow setup guide to get your session token', true);
    console.log('');

    const { sessionToken } = await inquirer.prompt([
      {
        type: 'password',
        name: 'sessionToken',
        message: 'Enter your Claude Code session token:',
        mask: '*',
        validate: (input) => {
          if (!input || input.trim() === '') {
            return 'Session token cannot be empty';
          }
          return true;
        }
      }
    ]);

    ui.info('Tip: Set CLAUDE_CODE_SESSION_ACCESS_TOKEN environment variable', true);
    console.log('');

    // Set in current process
    process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN = sessionToken.trim();

    return sessionToken.trim();
  }

  /**
   * Get OpenAI API key
   */
  async getOpenAIKey(providerConfig) {
    // Check environment
    if (process.env.OPENAI_API_KEY) {
      return process.env.OPENAI_API_KEY;
    }

    // Check config
    if (providerConfig.api_key) {
      return providerConfig.api_key;
    }

    // Prompt user
    ui.warning('OpenAI API key not found', true);
    ui.info('Get your API key from: https://platform.openai.com/api-keys', true);
    console.log('');

    const { apiKey, saveToConfig } = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your OpenAI API key:',
        mask: '*',
        validate: (input) => {
          if (!input || input.trim() === '') {
            return 'API key cannot be empty';
          }
          if (!input.startsWith('sk-')) {
            return 'OpenAI API keys typically start with "sk-"';
          }
          return true;
        }
      },
      {
        type: 'confirm',
        name: 'saveToConfig',
        message: 'Save API key to config file (.mehaisi/config.json)?',
        default: true
      }
    ]);

    // Save to config if requested
    if (saveToConfig) {
      await this.saveApiKeyToConfig('openai', apiKey.trim());
      ui.success('API key saved to config', true);
      console.log('');
    } else {
      ui.info('Tip: Set OPENAI_API_KEY environment variable', true);
      console.log('');
    }

    return apiKey.trim();
  }

  /**
   * Save API key to provider config
   */
  async saveApiKeyToConfig(providerName, apiKey) {
    const config = await this.loadConfig();
    
    if (!config.llm) {
      config.llm = { providers: {} };
    }
    if (!config.llm.providers) {
      config.llm.providers = {};
    }
    if (!config.llm.providers[providerName]) {
      config.llm.providers[providerName] = {};
    }

    config.llm.providers[providerName].api_key = apiKey;
    await this.saveConfig(config);
  }

  /**
   * Validate credentials work by testing the provider
   * 
   * @param {string} providerName - Provider name
   * @param {Object} credentials - Credentials to validate
   * @returns {Promise<boolean>} Whether credentials are valid
   */
  async validateCredentials(providerName, credentials) {
    // This would be implemented to actually test the credentials
    // For now, just return true
    return true;
  }

  /**
   * Check if credentials are needed for a provider
   * 
   * @param {Object} providerConfig - Provider configuration
   * @returns {boolean} Whether credentials are required
   */
  needsCredentials(providerConfig) {
    if (providerConfig.type === 'ollama') {
      // Cloud Ollama needs credentials
      return providerConfig.url.includes('api.ollama.com');
    }
    if (providerConfig.type === 'claude-cli') {
      return true;
    }
    if (providerConfig.type === 'openai') {
      return true;
    }
    return false;
  }

  /**
   * Setup credentials for all configured providers interactively
   */
  async setupAllCredentials() {
    const config = await this.loadConfig();
    
    if (!config.llm?.providers) {
      ui.warning('No providers configured', true);
      return;
    }

    ui.header('Setting up credentials', 'lock');

    for (const [name, providerConfig] of Object.entries(config.llm.providers)) {
      if (this.needsCredentials(providerConfig)) {
        ui.section(`Provider: ${chalk.bold(name)}`);
        await this.getProviderCredentials(name, providerConfig);
      }
    }

    ui.success('Credential setup complete');
  }
}

module.exports = CredentialManager;
