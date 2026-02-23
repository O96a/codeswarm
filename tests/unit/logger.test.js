/**
 * Tests for Logger Module
 */

const {
  Logger,
  getLogger,
  createLogger,
  setLevel,
  closeAll,
  LOG_LEVELS
} = require('../../src/logger');

describe('Logger', () => {
  let mockConsoleLog;
  let mockConsoleError;
  let mockConsoleWarn;

  beforeEach(() => {
    // Mock console methods
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockConsoleWarn.mockRestore();
    await closeAll();
  });

  describe('Logger class', () => {
    it('should create a logger with a name', () => {
      const logger = new Logger('test');
      expect(logger.name).toBe('test');
    });

    it('should log info messages', () => {
      const logger = new Logger('test', { level: 'info' });
      logger.info('Test message');

      expect(mockConsoleLog).toHaveBeenCalled();
      const call = mockConsoleLog.mock.calls[0][0];
      expect(call).toContain('INFO');
      expect(call).toContain('Test message');
    });

    it('should log error messages', () => {
      const logger = new Logger('test', { level: 'info' });
      logger.error('Error message');

      expect(mockConsoleError).toHaveBeenCalled();
      const call = mockConsoleError.mock.calls[0][0];
      expect(call).toContain('ERROR');
      expect(call).toContain('Error message');
    });

    it('should log warn messages', () => {
      const logger = new Logger('test', { level: 'info' });
      logger.warn('Warning message');

      expect(mockConsoleWarn).toHaveBeenCalled();
      const call = mockConsoleWarn.mock.calls[0][0];
      expect(call).toContain('WARN');
      expect(call).toContain('Warning message');
    });

    it('should respect log level', () => {
      const logger = new Logger('test', { level: 'warn' });

      logger.info('Should not log');
      logger.warn('Should log');
      logger.error('Should log');

      expect(mockConsoleLog).not.toHaveBeenCalled();
      expect(mockConsoleWarn).toHaveBeenCalledTimes(1);
      expect(mockConsoleError).toHaveBeenCalledTimes(1);
    });

    it('should not log debug messages when level is info', () => {
      const logger = new Logger('test', { level: 'info' });
      logger.debug('Debug message');

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should log debug messages when level is debug', () => {
      const logger = new Logger('test', { level: 'debug' });
      logger.debug('Debug message');

      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it('should include additional data in log output', () => {
      const logger = new Logger('test', { level: 'info' });
      logger.info('Test message', { key: 'value' });

      const call = mockConsoleLog.mock.calls[0][0];
      expect(call).toContain('key');
      expect(call).toContain('value');
    });

    it('should handle Error objects in error method', () => {
      const logger = new Logger('test', { level: 'info' });
      const error = new Error('Test error');
      logger.error('An error occurred', error);

      const call = mockConsoleError.mock.calls[0][0];
      expect(call).toContain('Test error');
    });

    it('should create child loggers', () => {
      const parent = new Logger('parent', { level: 'info' });
      const child = parent.child('child');

      expect(child.name).toBe('parent:child');
    });
  });

  describe('getLogger', () => {
    it('should return cached logger instance', () => {
      const logger1 = getLogger('test');
      const logger2 = getLogger('test');

      expect(logger1).toBe(logger2);
    });
  });

  describe('createLogger', () => {
    it('should create a new logger', () => {
      const logger = createLogger('new-test');
      expect(logger).toBeInstanceOf(Logger);
      expect(logger.name).toBe('new-test');
    });
  });

  describe('setLevel', () => {
    it('should update log level for all loggers', async () => {
      const logger1 = createLogger('logger1');
      const logger2 = createLogger('logger2');

      setLevel('debug');

      expect(logger1.level).toBe(LOG_LEVELS.debug);
      expect(logger2.level).toBe(LOG_LEVELS.debug);
    });
  });

  describe('LOG_LEVELS', () => {
    it('should have correct level ordering', () => {
      expect(LOG_LEVELS.error).toBeLessThan(LOG_LEVELS.warn);
      expect(LOG_LEVELS.warn).toBeLessThan(LOG_LEVELS.info);
      expect(LOG_LEVELS.info).toBeLessThan(LOG_LEVELS.debug);
    });
  });
});
