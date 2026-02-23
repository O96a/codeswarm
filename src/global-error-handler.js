/**
 * Global Error Handler
 *
 * Provides a global error boundary for uncaught exceptions and unhandled rejections.
 * Ensures graceful shutdown with resource cleanup and session state preservation.
 */

const { ErrorHandler, CodeSwarmError } = require('./error-handler');
const { createLogger, closeAll: closeLoggers } = require('./logger');

const logger = createLogger('global-error-handler');

// Track if we're already shutting down
let isShuttingDown = false;

// Registered cleanup handlers
const cleanupHandlers = [];

// Session state for preservation on crash
let sessionState = null;

/**
 * Register a cleanup handler to be called during shutdown
 * @param {Function} handler - Async cleanup function
 * @param {string} name - Handler name for logging
 */
function registerCleanupHandler(handler, name = 'unnamed') {
  cleanupHandlers.push({ handler, name });
}

/**
 * Unregister a cleanup handler
 * @param {Function} handler - Handler to remove
 */
function unregisterCleanupHandler(handler) {
  const index = cleanupHandlers.findIndex(h => h.handler === handler);
  if (index !== -1) {
    cleanupHandlers.splice(index, 1);
  }
}

/**
 * Set session state for crash recovery
 * @param {Object} state - Session state object
 */
function setSessionState(state) {
  sessionState = state;
}

/**
 * Get last known session state (for crash recovery)
 * @returns {Object|null} Session state
 */
function getSessionState() {
  return sessionState;
}

/**
 * Run all cleanup handlers
 * @param {string} reason - Reason for cleanup
 */
async function runCleanupHandlers(reason) {
  logger.info(`Running ${cleanupHandlers.length} cleanup handlers (${reason})`);

  const results = [];

  for (const { handler, name } of cleanupHandlers) {
    try {
      await handler();
      results.push({ name, success: true });
      logger.debug(`Cleanup handler completed: ${name}`);
    } catch (error) {
      results.push({ name, success: false, error: error.message });
      logger.error(`Cleanup handler failed: ${name}`, { error: error.message });
    }
  }

  return results;
}

/**
 * Perform graceful shutdown
 * @param {string} reason - Reason for shutdown
 * @param {number} exitCode - Exit code
 * @param {Error} [error] - Optional error that triggered shutdown
 */
async function gracefulShutdown(reason, exitCode = 0, error = null) {
  // Prevent multiple shutdown attempts
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger.info(`Initiating graceful shutdown: ${reason}`);

  // Log error if provided
  if (error) {
    logger.error('Shutdown triggered by error', {
      error: error.message,
      stack: error.stack
    });
  }

  // Run cleanup handlers with timeout
  const cleanupTimeout = setTimeout(() => {
    logger.warn('Cleanup handlers timed out after 10 seconds, forcing exit');
    process.exit(exitCode);
  }, 10000);

  try {
    await runCleanupHandlers(reason);
  } catch (err) {
    logger.error('Error during cleanup', { error: err.message });
  }

  clearTimeout(cleanupTimeout);

  // Close all loggers
  await closeLoggers();

  // Exit
  process.exit(exitCode);
}

/**
 * Handle uncaught exception
 * @param {Error} error - The uncaught error
 */
async function handleUncaughtException(error) {
  logger.error('Uncaught exception detected', error);

  // Check if error is fatal
  const isFatal = ErrorHandler.isFatal(error);

  if (isFatal) {
    await gracefulShutdown('uncaught-exception', 1, error);
  } else {
    logger.warn('Non-fatal uncaught exception, continuing execution');
    // For non-fatal errors, we might want to continue
    // but the process is in an undefined state
  }
}

/**
 * Handle unhandled promise rejection
 * @param {Error} reason - The rejection reason
 * @param {Promise} promise - The rejected promise
 */
async function handleUnhandledRejection(reason, promise) {
  logger.error('Unhandled promise rejection', {
    reason: reason?.message || String(reason),
    stack: reason?.stack
  });

  // Convert to proper error if needed
  const error = reason instanceof Error ? reason : new Error(String(reason));

  // Check if error is fatal
  const isFatal = ErrorHandler.isFatal(error);

  if (isFatal) {
    await gracefulShutdown('unhandled-rejection', 1, error);
  } else {
    logger.warn('Non-fatal unhandled rejection, continuing execution');
  }
}

/**
 * Handle termination signals
 * @param {string} signal - The signal received
 */
async function handleSignal(signal) {
  logger.info(`Received ${signal} signal`);
  await gracefulShutdown(signal, 0);
}

/**
 * Initialize the global error handler
 * @param {Object} options - Configuration options
 * @param {boolean} options.exitOnUncaught - Exit on uncaught exceptions (default: true)
 * @param {boolean} options.exitOnRejection - Exit on unhandled rejections (default: true)
 */
function initialize(options = {}) {
  const {
    exitOnUncaught = true,
    exitOnRejection = true
  } = options;

  // Handle uncaught exceptions
  if (exitOnUncaught) {
    process.on('uncaughtException', handleUncaughtException);
  }

  // Handle unhandled rejections
  if (exitOnRejection) {
    process.on('unhandledRejection', handleUnhandledRejection);
  }

  // Handle termination signals
  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  process.on('SIGINT', () => handleSignal('SIGINT'));

  // Handle beforeExit (cleanup)
  process.on('beforeExit', async (code) => {
    logger.info(`Process exiting with code ${code}`);
    await runCleanupHandlers('beforeExit');
  });

  logger.info('Global error handler initialized', {
    exitOnUncaught,
    exitOnRejection
  });

  return {
    registerCleanupHandler,
    unregisterCleanupHandler,
    setSessionState,
    getSessionState,
    gracefulShutdown
  };
}

/**
 * Wrap an async function with error handling
 * @param {Function} fn - Async function to wrap
 * @param {string} name - Function name for logging
 * @returns {Function} Wrapped function
 */
function wrapAsync(fn, name = fn.name || 'anonymous') {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      logger.error(`Error in ${name}`, {
        error: error.message,
        args: args.length > 0 ? '(args omitted)' : '(no args)'
      });

      // Re-throw after logging
      throw error;
    }
  };
}

/**
 * Wrap the main entry point with global error handling
 * @param {Function} main - Main function to wrap
 * @returns {Function} Wrapped main function
 */
function wrapMain(main) {
  return async (...args) => {
    try {
      initialize();
      const result = await main(...args);
      await gracefulShutdown('normal-completion', 0);
      return result;
    } catch (error) {
      await gracefulShutdown('main-error', 1, error);
    }
  };
}

module.exports = {
  initialize,
  registerCleanupHandler,
  unregisterCleanupHandler,
  setSessionState,
  getSessionState,
  gracefulShutdown,
  handleUncaughtException,
  handleUnhandledRejection,
  wrapAsync,
  wrapMain
};
