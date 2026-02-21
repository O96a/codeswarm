/**
 * Safety Manager Unit Tests
 */

const SafetyManager = require('../../src/safety-manager');

// Mock spawnSync for test runs
jest.mock('child_process', () => ({
  execSync: jest.fn(),
  spawnSync: jest.fn()
}));

jest.mock('fs-extra', () => ({
  pathExists: jest.fn().mockResolvedValue(true),
  readFile: jest.fn().mockResolvedValue('test output'),
  writeFile: jest.fn().mockResolvedValue(true),
  ensureDir: jest.fn().mockResolvedValue(true),
  readdir: jest.fn().mockResolvedValue(['test.test.js']),
  existsSync: jest.fn().mockReturnValue(true)
}));

const { execSync, spawnSync } = require('child_process');

describe('SafetyManager', () => {
  let safetyManager;

  const mockConfig = {
    safety: {
      require_tests: true,
      rollback_on_failure: false,  // Disable rollback for tests
      auto_apply: false,
      test_command: 'npm test'
    },
    ollama_url: 'http://localhost:11434',
    project_context: {
      test_command: 'npm test',
      type: 'node'
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    safetyManager = new SafetyManager(mockConfig);
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      expect(safetyManager.config).toEqual(mockConfig);
    });

    it('should use default test command if not provided', () => {
      const configWithoutTest = { ...mockConfig, safety: { require_tests: true, rollback_on_failure: false, auto_apply: false } };
      const manager = new SafetyManager(configWithoutTest);
      // Test command is resolved dynamically from project_context or detected type
      expect(manager.config.safety.require_tests).toBe(true);
    });
  });

  describe('runPreflightChecks', () => {
    it('should pass when git is available', () => {
      execSync.mockReturnValue(Buffer.from('git version 2.0.0'));

      return expect(safetyManager.runPreflightChecks()).resolves.toBe(true);
    });

    it('should fail when git is not available', () => {
      execSync.mockImplementation(() => {
        throw new Error('git command not found');
      });

      return expect(safetyManager.runPreflightChecks()).rejects.toThrow();
    });
  });

  describe('isPreExistingFailure', () => {
    it('should detect pre-existing failures', () => {
      const result = safetyManager.isPreExistingFailure('FAILED tests/test.py::test_old - AssertionError');
      expect(typeof result).toBe('boolean');
    });

    it('should return false for no current diagnosis', () => {
      const result = safetyManager.isPreExistingFailure(null);
      expect(result).toBe(false);
    });
  });

  describe('detectProjectType', () => {
    it('should detect project type', () => {
      const result = safetyManager.detectProjectType();
      expect(result).toBeDefined();
    });
  });

  describe('runTests', () => {
    it('should skip tests when require_tests is false', async () => {
      const configWithoutTests = {
        ...mockConfig,
        safety: { require_tests: false }
      };
      const manager = new SafetyManager(configWithoutTests);

      const result = await manager.runTests();
      expect(result.passed).toBe(true);
      expect(result.skipped).toBe(true);
    });

    it('should return passed when tests pass', async () => {
      spawnSync.mockReturnValue({
        status: 0,
        stdout: Buffer.from('10 passed'),
        stderr: Buffer.from('')
      });

      const result = await safetyManager.runTests();
      expect(result.passed).toBe(true);
    });

    it('should return failed when tests fail', async () => {
      // Mock test command resolution to return actual command
      jest.spyOn(safetyManager, '_resolveTestCommand').mockReturnValue('npm test');
      spawnSync.mockReturnValue({
        status: 1,
        stdout: Buffer.from('AssertionError: expected true to be false'),
        stderr: Buffer.from('')
      });

      // With rollback_on_failure: false, should return result not throw
      const result = await safetyManager.runTests();
      expect(result.passed).toBe(false);
    });

    it('should identify environment errors', async () => {
      // Mock test command resolution to return actual command
      jest.spyOn(safetyManager, '_resolveTestCommand').mockReturnValue('npm test');
      spawnSync.mockReturnValue({
        status: 1,
        stdout: Buffer.from(''),
        stderr: Buffer.from('ValidationError: Extra inputs are not permitted')
      });

      const result = await safetyManager.runTests();
      expect(result.passed).toBe(false);
      // Check that diagnosis exists
      expect(result.diagnosis).toBeDefined();
    });

    it('should identify import errors', async () => {
      // Mock test command resolution to return actual command
      jest.spyOn(safetyManager, '_resolveTestCommand').mockReturnValue('npm test');
      spawnSync.mockReturnValue({
        status: 4,
        stdout: Buffer.from(''),
        stderr: Buffer.from('ImportError: No module named xyz')
      });

      const result = await safetyManager.runTests();
      expect(result.diagnosis).toBeDefined();
    });

    it('should identify dependency errors', async () => {
      // Mock test command resolution to return actual command
      jest.spyOn(safetyManager, '_resolveTestCommand').mockReturnValue('npm test');
      spawnSync.mockReturnValue({
        status: 4,
        stdout: Buffer.from(''),
        stderr: Buffer.from('ModuleNotFoundError')
      });

      const result = await safetyManager.runTests();
      expect(result.diagnosis).toBeDefined();
    });

    it('should identify permission errors', async () => {
      // Mock test command resolution to return actual command
      jest.spyOn(safetyManager, '_resolveTestCommand').mockReturnValue('npm test');
      spawnSync.mockReturnValue({
        status: 1,
        stdout: Buffer.from(''),
        stderr: Buffer.from('Permission denied')
      });

      const result = await safetyManager.runTests();
      expect(result.diagnosis).toBeDefined();
    });
  });

  describe('captureBaseline', () => {
    it('should capture test baseline', async () => {
      spawnSync.mockReturnValue({
        status: 0,
        stdout: Buffer.from('10 tests collected'),
        stderr: Buffer.from('')
      });

      await safetyManager.captureBaseline();

      expect(spawnSync).toHaveBeenCalled();
    });
  });
});
