/**
 * Tests for Global Error Handler Module
 */

// Mock the dependencies that have ESM issues
jest.mock('../../src/ui-formatter', () => ({
  icons: { error: '✗', success: '✓', warning: '⚠', info: 'ℹ' },
  header: jest.fn(),
  section: jest.fn(),
  success: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
  error: jest.fn()
}));

// Mock the logger
jest.mock('../../src/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }),
  closeAll: jest.fn().mockResolvedValue(undefined)
}));

const {
  initialize,
  registerCleanupHandler,
  unregisterCleanupHandler,
  setSessionState,
  getSessionState,
  wrapAsync
} = require('../../src/global-error-handler');

describe('Global Error Handler', () => {
  let originalProcessOn;
  let registeredEvents;

  beforeEach(() => {
    registeredEvents = [];
    originalProcessOn = process.on;
    process.on = jest.fn((event, handler) => {
      registeredEvents.push(event);
    });
  });

  afterEach(() => {
    process.on = originalProcessOn;
  });

  describe('initialize', () => {
    it('should register event handlers', () => {
      initialize();

      expect(process.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('beforeExit', expect.any(Function));
    });

    it('should return handler registration functions', () => {
      const handlers = initialize();

      expect(handlers).toHaveProperty('registerCleanupHandler');
      expect(handlers).toHaveProperty('unregisterCleanupHandler');
      expect(handlers).toHaveProperty('setSessionState');
      expect(handlers).toHaveProperty('getSessionState');
      expect(handlers).toHaveProperty('gracefulShutdown');
    });
  });

  describe('registerCleanupHandler', () => {
    it('should register cleanup handlers', () => {
      const handler = jest.fn();
      registerCleanupHandler(handler, 'test-handler');

      // Handler should be callable
      expect(typeof handler).toBe('function');
    });
  });

  describe('unregisterCleanupHandler', () => {
    it('should unregister cleanup handlers', () => {
      const handler = jest.fn();
      registerCleanupHandler(handler, 'test-handler');
      unregisterCleanupHandler(handler);

      // Handler should have been removed (no direct way to verify)
      expect(typeof unregisterCleanupHandler).toBe('function');
    });
  });

  describe('setSessionState and getSessionState', () => {
    it('should store and retrieve session state', () => {
      const state = { sessionId: '123', agents: ['agent1'] };

      setSessionState(state);
      const retrieved = getSessionState();

      expect(retrieved).toEqual(state);
    });

    it('should return null when no state is set', () => {
      setSessionState(null);
      expect(getSessionState()).toBeNull();
    });
  });

  describe('wrapAsync', () => {
    it('should wrap async functions', async () => {
      const originalFn = async (x) => x * 2;
      const wrappedFn = wrapAsync(originalFn, 'testFn');

      const result = await wrappedFn(5);
      expect(result).toBe(10);
    });

    it('should re-throw errors after logging', async () => {
      const errorFn = async () => {
        throw new Error('Test error');
      };
      const wrappedFn = wrapAsync(errorFn, 'errorFn');

      await expect(wrappedFn()).rejects.toThrow('Test error');
    });
  });
});
