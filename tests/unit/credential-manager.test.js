/**
 * Credential Manager Unit Tests
 */

// Mock ui-formatter first (boxen is ESM-only and breaks Jest)
jest.mock('../../src/ui-formatter', () => ({
  icons: { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' },
  warning: jest.fn(),
  info: jest.fn()
}));

const CredentialManager = require('../../src/credential-manager');
const fs = require('fs-extra');

jest.mock('fs-extra');
jest.mock('inquirer', () => ({
  prompt: jest.fn()
}));

describe('CredentialManager', () => {
  let credManager;
  const mockConfigPath = '/test/.mehaisi/config.json';

  beforeEach(() => {
    jest.clearAllMocks();
    credManager = new CredentialManager(mockConfigPath);
  });

  describe('constructor', () => {
    it('should initialize with config path', () => {
      expect(credManager.configPath).toBe(mockConfigPath);
      expect(credManager.config).toBeNull();
    });
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

    it('should return cached config on subsequent calls', async () => {
      const mockConfig = { llm: { providers: {} } };
      fs.pathExists.mockResolvedValue(true);
      fs.readJSON.mockResolvedValue(mockConfig);

      await credManager.loadConfig();
      const result2 = await credManager.loadConfig();

      expect(fs.readJSON).toHaveBeenCalledTimes(1);
      expect(result2).toEqual(mockConfig);
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

    it('should get Ollama API key from environment (OLLAMA_API_KEY)', async () => {
      process.env.OLLAMA_API_KEY = 'test-key-2';

      const result = await credManager.getProviderCredentials('ollama', {
        type: 'ollama',
        url: 'https://api.ollama.com'
      });

      expect(result.apiKey).toBe('test-key-2');
      delete process.env.OLLAMA_API_KEY;
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
      process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN = 'session-123';

      const result = await credManager.getProviderCredentials('claude-cli', {
        type: 'claude-cli'
      });

      expect(result.sessionToken).toBe('session-123');
      delete process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN;
    });

    it('should return empty object for providers without credentials', async () => {
      const result = await credManager.getProviderCredentials('local', {
        type: 'local'
      });

      expect(result).toEqual({});
    });
  });

  describe('needsCredentials', () => {
    it('should return true for ollama cloud', () => {
      const result = credManager.needsCredentials({
        type: 'ollama',
        url: 'https://api.ollama.com'
      });
      expect(result).toBe(true);
    });

    it('should return true for claude-cli', () => {
      const result = credManager.needsCredentials({
        type: 'claude-cli'
      });
      expect(result).toBe(true);
    });

    it('should return true for openai', () => {
      const result = credManager.needsCredentials({
        type: 'openai'
      });
      expect(result).toBe(true);
    });

    it('should return false for local provider', () => {
      const result = credManager.needsCredentials({
        type: 'local'
      });
      expect(result).toBe(false);
    });
  });

  describe('saveApiKeyToConfig', () => {
    it('should save API key to config', async () => {
      const currentConfig = { llm: { providers: { ollama: {} } } };
      fs.pathExists.mockResolvedValue(true);
      fs.readJSON.mockResolvedValue(currentConfig);

      await credManager.saveApiKeyToConfig('ollama', 'test-key');

      expect(fs.writeJSON).toHaveBeenCalled();
    });

    it('should create providers object if not exists', async () => {
      const currentConfig = { llm: {} };
      fs.pathExists.mockResolvedValue(true);
      fs.readJSON.mockResolvedValue(currentConfig);

      await credManager.saveApiKeyToConfig('ollama', 'test-key');

      expect(fs.writeJSON).toHaveBeenCalledWith(
        mockConfigPath,
        expect.objectContaining({
          llm: {
            providers: {
              ollama: { api_key: 'test-key' }
            }
          }
        }),
        { spaces: 2 }
      );
    });
  });
});
