/**
 * Credential Manager Unit Tests
 */

const CredentialManager = require('../../src/credential-manager');
const fs = require('fs-extra');

jest.mock('fs-extra');
jest.mock('inquirer', () => ({
  prompt: jest.fn()
}));

const inquirer = require('inquirer');

describe('CredentialManager', () => {
  let credManager;
  const mockConfigPath = '/test/.mehaisi/config.json';

  beforeEach(() => {
    jest.clearAllMocks();
    credManager = new CredentialManager(mockConfigPath);
  });

  describe('loadConfig', () => {
    it('should load config from file', async () => {
      const mockConfig = { llm: { providers: {} } };
      fs.pathExists.mockResolvedValue(true);
      fs.readJSON.mockResolvedValue(mockConfig);

      const result = await credManager.loadConfig();

      expect(result).toEqual(mockConfig);
      expect(credManager.config).toEqual(mockConfig);
    });

    it('should return null if config does not exist', async () => {
      fs.pathExists.mockResolvedValue(false);

      const result = await credManager.loadConfig();

      expect(result).toBeNull();
    });
  });

  describe('saveConfig', () => {
    it('should save config to file', async () => {
      const mockConfig = { llm: { providers: {} } };

      await credManager.saveConfig(mockConfig);

      expect(fs.writeJSON).toHaveBeenCalledWith(mockConfigPath, mockConfig, { spaces: 2 });
      expect(credManager.config).toEqual(mockConfig);
    });
  });

  describe('getProviderCredentials', () => {
    it('should get Ollama Cloud API key from environment', async () => {
      process.env.OLLAMA_CLOUD_API_KEY = 'test-key';

      const result = await credManager.getProviderCredentials('ollama-cloud', {
        type: 'ollama',
        url: 'https://api.ollama.com'
      });

      expect(result.apiKey).toBe('test-key');
      delete process.env.OLLAMA_CLOUD_API_KEY;
    });

    it('should get OpenAI API key from environment', async () => {
      process.env.OPENAI_API_KEY = 'sk-test';

      const result = await credManager.getProviderCredentials('openai', {
        type: 'openai'
      });

      expect(result.apiKey).toBe('sk-test');
      delete process.env.OPENAI_API_KEY;
    });

    it('should get Claude session token from environment', async () => {
      process.env.ANTHROPIC_SESSION_TOKEN = 'session-123';

      const result = await credManager.getProviderCredentials('claude-cli', {
        type: 'claude-cli'
      });

      expect(result.sessionToken).toBe('session-123');
      delete process.env.ANTHROPIC_SESSION_TOKEN;
    });
  });

  describe('validateOllamaCloudKey', () => {
    it('should return true for valid API key format', async () => {
      const result = await credManager.validateOllamaCloudKey('sk-valid-key-123');
      expect(result).toBe(true);
    });

    it('should return false for empty key', async () => {
      const result = await credManager.validateOllamaCloudKey('');
      expect(result).toBe(false);
    });

    it('should return false for short key', async () => {
      const result = await credManager.validateOllamaCloudKey('short');
      expect(result).toBe(false);
    });
  });

  describe('validateOpenAIKey', () => {
    it('should return true for valid OpenAI key format', async () => {
      const result = await credManager.validateOpenAIKey('sk-proj-validkey123');
      expect(result).toBe(true);
    });

    it('should return false for invalid format', async () => {
      const result = await credManager.validateOpenAIKey('invalid-key');
      expect(result).toBe(false);
    });
  });

  describe('saveProviderCredentials', () => {
    it('should save credentials to config', async () => {
      const currentConfig = { llm: { providers: { ollama: {} } } };
      fs.pathExists.mockResolvedValue(true);
      fs.readJSON.mockResolvedValue(currentConfig);

      await credManager.saveProviderCredentials('ollama', { apiKey: 'test-key' });

      expect(fs.writeJSON).toHaveBeenCalled();
    });
  });
});
