/**
 * Config Manager Unit Tests
 */

// Mock ui-formatter first (boxen is ESM-only and breaks Jest)
jest.mock('../../src/ui-formatter', () => ({
  icons: { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' },
  header: jest.fn(),
  section: jest.fn(),
  success: jest.fn(),
  warning: jest.fn(),
  error: jest.fn()
}));

const { configureSettings } = require('../../src/config-manager');
const fs = require('fs-extra');

jest.mock('fs-extra');
jest.mock('inquirer', () => ({
  prompt: jest.fn()
}));

describe('Config Manager', () => {
  const mockConfigPath = '/test/.mehaisi/config.json';

  beforeEach(() => {
    jest.clearAllMocks();
    process.cwd = jest.fn().mockReturnValue('/test');
  });

  describe('configureSettings', () => {
    it('should display current configuration with --list option', async () => {
      const mockConfig = {
        model: 'test-model',
        ollama_url: 'http://localhost:11434',
        safety: { require_tests: true }
      };
      fs.pathExists.mockResolvedValue(true);
      fs.readJSON.mockResolvedValue(mockConfig);

      await configureSettings({ list: true });

      expect(fs.readJSON).toHaveBeenCalled();
    });

    it('should handle missing config file', async () => {
      fs.pathExists.mockResolvedValue(false);

      await expect(configureSettings({ list: true }))
        .resolves.toBeDefined();
    });

    it('should handle interactive option', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.readJSON.mockResolvedValue({ model: 'test' });

      await configureSettings({ interactive: true });

      expect(fs.pathExists).toHaveBeenCalled();
    });

    it('should update auto_apply setting', async () => {
      const mockConfig = {
        model: 'test-model',
        safety: { require_tests: true, rollback_on_failure: true }
      };
      fs.pathExists.mockResolvedValue(true);
      fs.readJSON.mockResolvedValue(mockConfig);

      await configureSettings({ autoApply: true });

      expect(fs.writeJSON).toHaveBeenCalled();
    });

    it('should update require_tests setting', async () => {
      const mockConfig = {
        model: 'test-model',
        safety: {}
      };
      fs.pathExists.mockResolvedValue(true);
      fs.readJSON.mockResolvedValue(mockConfig);

      await configureSettings({ requireTests: true });

      expect(fs.writeJSON).toHaveBeenCalled();
    });

    it('should update rollback_on_failure setting', async () => {
      const mockConfig = { model: 'test-model' };
      fs.pathExists.mockResolvedValue(true);
      fs.readJSON.mockResolvedValue(mockConfig);

      await configureSettings({ rollbackOnFailure: true });

      expect(fs.writeJSON).toHaveBeenCalled();
    });

    it('should update model setting', async () => {
      const mockConfig = { model: 'old-model' };
      fs.pathExists.mockResolvedValue(true);
      fs.readJSON.mockResolvedValue(mockConfig);

      await configureSettings({ model: 'new-model' });

      expect(fs.writeJSON).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ model: 'new-model' }),
        expect.any(Object)
      );
    });

    it('should update provider setting', async () => {
      const mockConfig = { model: 'test-model' };
      fs.pathExists.mockResolvedValue(true);
      fs.readJSON.mockResolvedValue(mockConfig);

      await configureSettings({ provider: 'ollama-cloud' });

      expect(fs.writeJSON).toHaveBeenCalled();
    });
  });
});
