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
      rollback_on_failure: true,
      auto_apply: false,
      test_command: 'npm test'
    },
    ollama_url: 'http://localhost:11434'
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
      const configWithoutTest = { ...mockConfig, safety: {} };
      const manager = new SafetyManager(configWithoutTest);
      expect(manager.config.safety.test_command).toBe('npm test');
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

  describe('captureBaseline', () => {
    it('should capture test baseline', async () => {
      spawnSync.mockReturnValue({
        status: 0,
        stdout: Buffer.from('10 tests collected'),
        stderr: Buffer.from('')
      });

      await safetyManager.captureBaseline();

      expect(spawnSync).toHaveBeenCalledWith('npm', expect.any(Array), expect.any(Object));
    });
  });

  describe('runTests', () => {
    it('should return passed when tests pass', () => {
      spawnSync.mockReturnValue({
        status: 0,
        stdout: Buffer.from('10 passed'),
        stderr: Buffer.from('')
      });

      const result = safetyManager.runTests();
      expect(result.passed).toBe(true);
    });

    it('should return failed with diagnosis when tests fail', () => {
      spawnSync.mockReturnValue({
        status: 1,
        stdout: Buffer.from('AssertionError: expected true to be false'),
        stderr: Buffer.from('')
      });

      const result = safetyManager.runTests();
      expect(result.passed).toBe(false);
      expect(result.diagnosis).toBeDefined();
    });

    it('should identify environment errors', () => {
      spawnSync.mockReturnValue({
        status: 1,
        stdout: Buffer.from(''),
        stderr: Buffer.from('ValidationError: Extra inputs are not permitted')
      });

      const result = safetyManager.runTests();
      expect(result.passed).toBe(false);
      expect(result.diagnosis.category).toBe('environment_error');
    });

    it('should identify import errors', () => {
      spawnSync.mockReturnValue({
        status: 4,
        stdout: Buffer.from(''),
        stderr: Buffer.from('ImportError: No module named xyz')
      });

      const result = safetyManager.runTests();
      expect(result.diagnosis.category).toBe('import_error');
    });

    it('should identify dependency errors', () => {
      spawnSync.mockReturnValue({
        status: 4,
        stdout: Buffer.from(''),
        stderr: Buffer.from('ModuleNotFoundError')
      });

      const result = safetyManager.runTests();
      expect(result.diagnosis.category).toBe('dependency_error');
    });

    it('should identify permission errors', () => {
      spawnSync.mockReturnValue({
        status: 1,
        stdout: Buffer.from(''),
        stderr: Buffer.from('Permission denied')
      });

      const result = safetyManager.runTests();
      expect(result.diagnosis.category).toBe('permission_error');
    });
  });

  describe('validateTestOutput', () => {
    it('should detect pre-existing failures', () => {
      const stdout = 'FAILED tests/test.py::test_old - AssertionError';
      const isPreExisting = safetyManager.isPreExistingFailure(stdout);

      // The method should analyze and return whether it's pre-existing
      expect(typeof isPreExisting).toBe('boolean');
    });
  });

  describe('getTestFramework', () => {
    it('should detect pytest', async () => {
      const fs = require('fs-extra');
      fs.pathExists.mockImplementation((path) => {
        return Promise.resolve(path.includes('pytest.ini') || path.includes('conftest.py'));
      });

      const framework = await safetyManager.getTestFramework();
      expect(framework).toBe('pytest');
    });

    it('should detect jest', async () => {
      const fs = require('fs-extra');
      fs.pathExists.mockImplementation((path) => {
        return Promise.resolve(path.includes('jest.config'));
      });

      const framework = await safetyManager.getTestFramework();
      expect(framework).toBe('jest');
    });

    it('should return null for unknown framework', async () => {
      const fs = require('fs-extra');
      fs.pathExists.mockResolvedValue(false);

      const framework = await safetyManager.getTestFramework();
      expect(framework).toBeNull();
    });
  });

  describe('analyzeFailure', () => {
    it('should analyze failure with stdout and stderr', () => {
      const result = safetyManager.analyzeFailure(
        'test output',
        'error output',
        1
      );

      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('isAgentFault');
    });

    it('should classify assertion failures as agent fault', () => {
      const result = safetyManager.analyzeFailure(
        'AssertionError: expected 1 to be 2',
        '',
        1
      );

      expect(result.isAgentFault).toBe(true);
    });

    it('should classify environment errors as non-agent fault', () => {
      const result = safetyManager.analyzeFailure(
        '',
        'ValidationError: Extra inputs are not permitted',
        1
      );

      expect(result.isAgentFault).toBe(false);
    });
  });

  describe('checkTokenBudget', () => {
    it('should pass when under budget', () => {
      safetyManager.tokensUsed = 50000;
      expect(safetyManager.checkTokenBudget()).toBe(true);
    });

    it('should fail when over budget', () => {
      safetyManager.tokensUsed = 150000;
      expect(safetyManager.checkTokenBudget()).toBe(false);
    });
  });

  describe('recordTokenUsage', () => {
    it('should record token usage', () => {
      safetyManager.recordTokenUsage(1000);
      expect(safetyManager.tokensUsed).toBe(1000);
    });
  });
});
