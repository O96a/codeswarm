/**
 * Centralized Error Handler
 *
 * Provides standardized error classes and handling utilities for consistent
 * error reporting across the CodeSwarm application.
 */

const chalk = require('chalk');
const ui = require('./ui-formatter');

// ─── Base Error Classes ──────────────────────────────────────────────────────

/**
 * Base application error with error code and context
 */
class CodeSwarmError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'CodeSwarmError';
    this.code = options.code || 'UNKNOWN_ERROR';
    this.context = options.context || {};
    this.isRetryable = options.isRetryable ?? false;
    this.isFatal = options.isFatal ?? false;
    this.suggestion = options.suggestion || null;

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Get a formatted error message for CLI display
   */
  toDisplayString() {
    let output = `\n${ui.icons.error} ${this.name}: ${this.message}\n`;

    if (this.context && Object.keys(this.context).length > 0) {
      output += `\n${chalk.gray('Context:')}\n`;
      for (const [key, value] of Object.entries(this.context)) {
        output += `  ${chalk.gray(key)}: ${value}\n`;
      }
    }

    if (this.suggestion) {
      output += `\n${chalk.yellow('💡 Suggestion:')} ${this.suggestion}\n`;
    }

    return output;
  }

  /**
   * Convert to JSON for logging/API responses
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      isRetryable: this.isRetryable,
      isFatal: this.isFatal,
      suggestion: this.suggestion,
      stack: process.env.DEBUG ? this.stack : undefined
    };
  }
}

// ─── Specific Error Types ────────────────────────────────────────────────────

/**
 * Validation error for invalid input or configuration
 */
class ValidationError extends CodeSwarmError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || 'VALIDATION_ERROR',
      isFatal: true
    });
    this.name = 'ValidationError';
  }
}

/**
 * Authentication error for credential/auth failures
 */
class AuthenticationError extends CodeSwarmError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || 'AUTHENTICATION_ERROR',
      isRetryable: true,
      suggestion: options.suggestion || 'Run `codeswarm credentials` to setup your API keys.'
    });
    this.name = 'AuthenticationError';
  }
}

/**
 * Network error for connection/timeout issues
 */
class NetworkError extends CodeSwarmError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || 'NETWORK_ERROR',
      isRetryable: true
    });
    this.name = 'NetworkError';
  }
}

/**
 * File system error for file operations
 */
class FileSystemError extends CodeSwarmError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || 'FILE_SYSTEM_ERROR',
      isFatal: true
    });
    this.name = 'FileSystemError';
  }
}

/**
 * Agent execution error
 */
class AgentExecutionError extends CodeSwarmError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || 'AGENT_EXECUTION_ERROR'
    });
    this.name = 'AgentExecutionError';
    this.agentName = options.agentName;
    this.agentId = options.agentId;
  }
}

/**
 * Git operation error
 */
class GitError extends CodeSwarmError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || 'GIT_ERROR',
      isFatal: true
    });
    this.name = 'GitError';
  }
}

/**
 * Configuration error
 */
class ConfigurationError extends CodeSwarmError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || 'CONFIGURATION_ERROR',
      isFatal: true,
      suggestion: options.suggestion || 'Run `codeswarm config --interactive` to fix configuration.'
    });
    this.name = 'ConfigurationError';
  }
}

/**
 * Safety check error
 */
class SafetyError extends CodeSwarmError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || 'SAFETY_ERROR',
      isFatal: true
    });
    this.name = 'SafetyError';
  }
}

// ─── Error Handler Utilities ─────────────────────────────────────────────────

class ErrorHandler {
  /**
   * Log error to console with formatting
   */
  static log(error, verbose = false) {
    if (error instanceof CodeSwarmError) {
      console.error(error.toDisplayString());
    } else if (error instanceof Error) {
      console.error(`\n${ui.icons.error} ${error.name}: ${error.message}`);
      if (verbose && error.stack) {
        console.error(chalk.gray(error.stack));
      }
    } else {
      console.error(`${ui.icons.error} Unknown error:`, error);
    }
  }

  /**
   * Wrap a promise with error handling
   */
  static async wrap(promise, errorClass = CodeSwarmError, context = {}) {
    try {
      return await promise;
    } catch (error) {
      if (error instanceof errorClass) {
        throw error;
      }
      throw new errorClass(error.message, {
        context: {
          ...context,
          originalError: error.message
        },
        cause: error
      });
    }
  }

  /**
   * Classify an error and return appropriate error class
   */
  static classify(error) {
    const message = error.message?.toLowerCase() || '';

    // Authentication errors
    if (message.includes('auth') || message.includes('unauthorized') ||
        message.includes('401') || message.includes('api key')) {
      return new AuthenticationError(error.message);
    }

    // Network errors
    if (message.includes('network') || message.includes('timeout') ||
        message.includes('econnreset') || message.includes('enotfound') ||
        message.includes('etimedout')) {
      return new NetworkError(error.message);
    }

    // File system errors
    if (error.code === 'ENOENT' || error.code === 'EACCES' ||
        message.includes('no such file') || message.includes('permission')) {
      return new FileSystemError(error.message);
    }

    // Validation errors
    if (message.includes('invalid') || message.includes('validation') ||
        message.includes('required')) {
      return new ValidationError(error.message);
    }

    // Git errors
    if (message.includes('git') || message.includes('commit') ||
        message.includes('branch')) {
      return new GitError(error.message);
    }

    // Default
    return new CodeSwarmError(error.message);
  }

  /**
   * Check if error is retryable
   */
  static isRetryable(error) {
    if (error instanceof CodeSwarmError) {
      return error.isRetryable;
    }

    const message = error.message?.toLowerCase() || '';
    return message.includes('timeout') ||
           message.includes('network') ||
           message.includes('econnreset') ||
           message.includes('temporary');
  }

  /**
   * Check if error is fatal (should not retry)
   */
  static isFatal(error) {
    if (error instanceof CodeSwarmError) {
      return error.isFatal;
    }

    // Consider validation and auth errors as fatal
    const message = error.message?.toLowerCase() || '';
    return message.includes('invalid') ||
           message.includes('unauthorized') ||
           message.includes('permission denied');
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // Error classes
  CodeSwarmError,
  ValidationError,
  AuthenticationError,
  NetworkError,
  FileSystemError,
  AgentExecutionError,
  GitError,
  ConfigurationError,
  SafetyError,

  // Handler utilities
  ErrorHandler
};
