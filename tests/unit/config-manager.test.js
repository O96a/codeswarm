/**
 * Config Manager Unit Tests
 */

const ConfigManager = require('../../src/config-manager');
const fs = require('fs-extra');

jest.mock('fs-extra');
jest.mock('inquirer', () => ({
  prompt: jest.fn()
}));

const inquirer = require('inquirer');

describe('ConfigManager', () => {
  let configManager;
  const mockConfigPath = '/test/.mehaisi/config.json';

  beforeEach(() => {
    jest.clearAllMocks();
    configManager = new ConfigManager(mockConfigPath);
  });

  describe('loadConfig', () => {
    it('should load existing config', async () => {
      const mockConfig = { model: 'test-model', safety: {} };
      fs.pathExists.mockResolvedValue(true);
      fs.readJSON.mockResolvedValue(mockConfig);

      const result = await configManager.loadConfig();

      expect(result).toEqual(mockConfig);
    });

    it('should create default config if not exists', async () => {
      fs.pathExists.mockResolvedValue(false);

      await configManager.loadConfig();

      expect(fs.writeJSON).toHaveBeenCalled();
    });

    it('should migrate old config format', async () => {
      const oldConfig = {
        ollama_url: 'http://localhost:11434',
        model: 'old-model',
        agent_timeout: 600000
      };
      fs.pathExists.mockResolvedValue(true);
      fs.readJSON.mockResolvedValue(oldConfig);

      const result = await configManager.loadConfig();

      expect(result.llm).toBeDefined();
      expect(result.llm.providers).toBeDefined();
      expect(result.safety).toBeDefined();
    });
  });

  describe('updateConfig', () => {
    it('should update config with new values', async () => {
      const currentConfig = { model: 'old-model', safety: {} };
      fs.pathExists.mockResolvedValue(true);
      fs.readJSON.mockResolvedValue(currentConfig);

      await configManager.updateConfig({ model: 'new-model' });

      expect(fs.writeJSON).toHaveBeenCalledWith(
        mockConfigPath,
        expect.objectContaining({ model: 'new-model' }),
        { spaces: 2 }
      );
    });

    it('should merge nested objects', async () => {
      const currentConfig = {
        model: 'test-model',
        safety: { require_tests: true, rollback_on_failure: true }
      };
      fs.pathExists.mockResolvedValue(true);
      fs.readJSON.mockResolvedValue(currentConfig);

      await configManager.updateConfig({
        safety: { auto_apply: true }
      });

      expect(fs.writeJSON).toHaveBeenCalled();
    });
  });

  describe('validateConfig', () => {
    it('should return valid for correct config', () => {
      const config = {
        model: 'test-model',
        ollama_url: 'http://localhost:11434',
        safety: {
          require_tests: true,
          rollback_on_failure: true
        }
      };

      const result = configManager.validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect missing required fields', () => {
      const config = {};

      const result = configManager.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect invalid ollama_url format', () => {
      const config = {
        model: 'test-model',
        ollama_url: 'not-a-url'
      };

      const result = configManager.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('ollama_url')
      );
    });

    it('should detect invalid token budget', () => {
      const config = {
        model: 'test-model',
        ollama_url: 'http://localhost:11434',
        token_budget: -100
      };

      const result = configManager.validateConfig(config);

      expect(result.valid).toBe(false);
    });
  });

  describe('getDefaultConfig', () => {
    it('should return default configuration', () => {
      const defaultConfig = configManager.getDefaultConfig();

      expect(defaultConfig).toHaveProperty('model');
      expect(defaultConfig).toHaveProperty('ollama_url');
      expect(defaultConfig).toHaveProperty('safety');
      expect(defaultConfig.safety).toHaveProperty('require_tests');
      expect(defaultConfig.safety).toHaveProperty('rollback_on_failure');
    });
  });

  describe('resetToDefaults', () => {
    it('should reset config to defaults', async () => {
      await configManager.resetToDefaults();

      expect(fs.writeJSON).toHaveBeenCalledWith(
        mockConfigPath,
        expect.any(Object),
        { spaces: 2 }
      );
    });
  });

  describe('getSetting', () => {
    it('should get nested setting value', async () => {
      const config = {
        safety: {
          require_tests: true,
          rollback_on_failure: false
        }
      };
      configManager.config = config;

      const result = configManager.getSetting('safety.require_tests');
      expect(result).toBe(true);
    });

    it('should return undefined for missing setting', () => {
      configManager.config = { safety: {} };

      const result = configManager.getSetting('safety.nonexistent');
      expect(result).toBeUndefined();
    });

    it('should return default value for missing setting', () => {
      configManager.config = { safety: {} };

      const result = configManager.getSetting('safety.nonexistent', 'default');
      expect(result).toBe('default');
    });
  });

  describe('setSetting', () => {
    it('should set nested setting value', async () => {
      configManager.config = { safety: { require_tests: false } };
      fs.pathExists.mockResolvedValue(true);

      await configManager.setSetting('safety.require_tests', true);

      expect(configManager.config.safety.require_tests).toBe(true);
      expect(fs.writeJSON).toHaveBeenCalled();
    });
  });
});
