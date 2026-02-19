/**
 * Error Handler Unit Tests
 */

// Mock ui-formatter first (boxen is ESM-only and breaks Jest)
jest.mock('../../src/ui-formatter', () => ({
  icons: { success: '✓', error: '✗', warning: '⚠', info: 'ℹ', check: '✔', rocket: '🚀', gear: '⚙' }
}));

const {
  CodeSwarmError,
  ValidationError,
  AuthenticationError,
  NetworkError,
  FileSystemError,
  AgentExecutionError,
  GitError,
  ConfigurationError,
  SafetyError,
  ErrorHandler
} = require('../../src/error-handler');

describe('Error Handler', () => {
  describe('CodeSwarmError', () => {
    it('should create base error with default values', () => {
      const error = new CodeSwarmError('Test error');

      expect(error.name).toBe('CodeSwarmError');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('UNKNOWN_ERROR');
      expect(error.context).toEqual({});
      expect(error.isRetryable).toBe(false);
      expect(error.isFatal).toBe(false);
    });

    it('should create error with options', () => {
      const error = new CodeSwarmError('Test error', {
        code: 'TEST_CODE',
        context: { key: 'value' },
        isRetryable: true,
        isFatal: true,
        suggestion: 'Try again'
      });

      expect(error.code).toBe('TEST_CODE');
      expect(error.context).toEqual({ key: 'value' });
      expect(error.isRetryable).toBe(true);
      expect(error.isFatal).toBe(true);
      expect(error.suggestion).toBe('Try again');
    });

    it('should capture stack trace', () => {
      const error = new CodeSwarmError('Stack test');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('CodeSwarmError');
    });

    it('should convert to JSON', () => {
      const error = new CodeSwarmError('JSON test', {
        code: 'JSON_CODE',
        context: { data: 'test' }
      });

      const json = error.toJSON();
      expect(json.name).toBe('CodeSwarmError');
      expect(json.message).toBe('JSON test');
      expect(json.code).toBe('JSON_CODE');
      expect(json.context.data).toBe('test');
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with correct defaults', () => {
      const error = new ValidationError('Invalid input');

      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.isFatal).toBe(true);
    });
  });

  describe('AuthenticationError', () => {
    it('should create auth error with retryable flag', () => {
      const error = new AuthenticationError('Invalid API key');

      expect(error.name).toBe('AuthenticationError');
      expect(error.isRetryable).toBe(true);
      expect(error.suggestion).toContain('codeswarm credentials');
    });
  });

  describe('NetworkError', () => {
    it('should create network error as retryable', () => {
      const error = new NetworkError('Connection timeout');

      expect(error.name).toBe('NetworkError');
      expect(error.isRetryable).toBe(true);
    });
  });

  describe('FileSystemError', () => {
    it('should create file system error as fatal', () => {
      const error = new FileSystemError('File not found');

      expect(error.name).toBe('FileSystemError');
      expect(error.isFatal).toBe(true);
    });
  });

  describe('AgentExecutionError', () => {
    it('should create agent execution error with agent info', () => {
      const error = new AgentExecutionError('Agent failed', {
        agentName: 'test-agent',
        agentId: '123'
      });

      expect(error.name).toBe('AgentExecutionError');
      expect(error.agentName).toBe('test-agent');
      expect(error.agentId).toBe('123');
    });
  });

  describe('GitError', () => {
    it('should create git error as fatal', () => {
      const error = new GitError('Git push failed');

      expect(error.name).toBe('GitError');
      expect(error.isFatal).toBe(true);
    });
  });

  describe('ConfigurationError', () => {
    it('should create config error with suggestion', () => {
      const error = new ConfigurationError('Invalid config');

      expect(error.name).toBe('ConfigurationError');
      expect(error.isFatal).toBe(true);
      expect(error.suggestion).toContain('codeswarm config --interactive');
    });
  });

  describe('SafetyError', () => {
    it('should create safety error as fatal', () => {
      const error = new SafetyError('Safety check failed');

      expect(error.name).toBe('SafetyError');
      expect(error.isFatal).toBe(true);
    });
  });

  describe('ErrorHandler', () => {
    describe('classify', () => {
      it('should classify authentication errors', () => {
        const error = new Error('Unauthorized: invalid API key');
        const classified = ErrorHandler.classify(error);

        expect(classified.name).toBe('AuthenticationError');
      });

      it('should classify network errors', () => {
        const error = new Error('Connection timeout: ETIMEDOUT');
        const classified = ErrorHandler.classify(error);

        expect(classified.name).toBe('NetworkError');
      });

      it('should classify file system errors', () => {
        const error = Object.assign(new Error('File not found'), { code: 'ENOENT' });
        const classified = ErrorHandler.classify(error);

        expect(classified.name).toBe('FileSystemError');
      });

      it('should classify validation errors', () => {
        const error = new Error('Invalid input: validation failed');
        const classified = ErrorHandler.classify(error);

        expect(classified.name).toBe('ValidationError');
      });

      it('should classify git errors', () => {
        const error = new Error('Git commit failed');
        const classified = ErrorHandler.classify(error);

        expect(classified.name).toBe('GitError');
      });

      it('should default to CodeSwarmError for unknown errors', () => {
        const error = new Error('Unknown problem');
        const classified = ErrorHandler.classify(error);

        expect(classified.name).toBe('CodeSwarmError');
      });
    });

    describe('isRetryable', () => {
      it('should identify retryable errors', () => {
        expect(ErrorHandler.isRetryable(new Error('timeout'))).toBe(true);
        expect(ErrorHandler.isRetryable(new Error('network error'))).toBe(true);
        expect(ErrorHandler.isRetryable(new Error('ECONNRESET'))).toBe(true);
      });

      it('should identify non-retryable errors', () => {
        expect(ErrorHandler.isRetryable(new Error('invalid input'))).toBe(false);
        expect(ErrorHandler.isRetryable(new Error('file not found'))).toBe(false);
      });

      it('should respect CodeSwarmError isRetryable flag', () => {
        const retryable = new NetworkError('test');
        expect(ErrorHandler.isRetryable(retryable)).toBe(true);

        const nonRetryable = new ValidationError('test');
        expect(ErrorHandler.isRetryable(nonRetryable)).toBe(false);
      });
    });

    describe('isFatal', () => {
      it('should identify fatal errors', () => {
        expect(ErrorHandler.isFatal(new Error('invalid configuration'))).toBe(true);
        expect(ErrorHandler.isFatal(new Error('unauthorized'))).toBe(true);
      });

      it('should respect CodeSwarmError isFatal flag', () => {
        const fatal = new ValidationError('test');
        expect(ErrorHandler.isFatal(fatal)).toBe(true);
      });
    });

    describe('wrap', () => {
      it('should wrap successful promise', async () => {
        const result = await ErrorHandler.wrap(Promise.resolve('success'));
        expect(result).toBe('success');
      });

      it('should wrap failed promise with error class', async () => {
        await expect(
          ErrorHandler.wrap(Promise.reject(new Error('fail')), ValidationError)
        ).rejects.toThrow(ValidationError);
      });

      it('should preserve context in wrapped error', async () => {
        try {
          await ErrorHandler.wrap(
            Promise.reject(new Error('original')),
            CodeSwarmError,
            { operation: 'test' }
          );
        } catch (error) {
          expect(error.context.operation).toBe('test');
          expect(error.context.originalError).toBe('original');
        }
      });
    });
  });
});
