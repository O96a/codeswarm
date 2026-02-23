/**
 * Structured Logger Module
 *
 * Provides structured logging with log levels, JSON output, and environment variable control.
 * Replaces console.log/error throughout the application for consistent logging.
 */

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

// Log levels
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

// ANSI color codes for console output
const LEVEL_COLORS = {
  error: chalk.red,
  warn: chalk.yellow,
  info: chalk.blue,
  debug: chalk.gray
};

// Default configuration
const DEFAULT_CONFIG = {
  level: process.env.LOG_LEVEL || 'info',
  json: process.env.LOG_FORMAT === 'json',
  file: process.env.LOG_FILE || null,
  console: true,
  timestamp: true
};

/**
 * Logger class with structured output support
 */
class Logger {
  constructor(name, config = {}) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.level = LOG_LEVELS[this.config.level] ?? LOG_LEVELS.info;
    this.fileStream = null;

    // Initialize file stream if file logging is enabled
    if (this.config.file) {
      this.initFileStream();
    }
  }

  /**
   * Initialize file stream for log output
   */
  async initFileStream() {
    try {
      const logDir = path.dirname(this.config.file);
      await fs.ensureDir(logDir);
      this.fileStream = fs.createWriteStream(this.config.file, { flags: 'a' });
    } catch (error) {
      console.error(`Failed to initialize log file: ${error.message}`);
    }
  }

  /**
   * Format a log entry
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   * @returns {string|Object} Formatted log entry
   */
  formatEntry(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const entry = {
      timestamp,
      level,
      logger: this.name,
      message,
      ...data
    };

    if (this.config.json) {
      return JSON.stringify(entry);
    }

    // Human-readable format for console
    const levelStr = LEVEL_COLORS[level](`[${level.toUpperCase().padEnd(5)}]`);
    const timestampStr = chalk.gray(`[${timestamp}]`);
    const nameStr = chalk.cyan(`[${this.name}]`);

    let output = `${timestampStr} ${levelStr} ${nameStr} ${message}`;

    // Append data if present
    if (Object.keys(data).length > 0) {
      output += '\n' + chalk.gray(JSON.stringify(data, null, 2));
    }

    return output;
  }

  /**
   * Write log entry to outputs
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  log(level, message, data = {}) {
    const levelNum = LOG_LEVELS[level] ?? 0;

    // Check if this level should be logged
    if (levelNum > this.level) {
      return;
    }

    const entry = this.formatEntry(level, message, data);

    // Write to console
    if (this.config.console) {
      if (level === 'error') {
        console.error(entry);
      } else if (level === 'warn') {
        console.warn(entry);
      } else {
        console.log(entry);
      }
    }

    // Write to file
    if (this.fileStream) {
      const jsonEntry = JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        logger: this.name,
        message,
        ...data
      }) + '\n';
      this.fileStream.write(jsonEntry);
    }
  }

  /**
   * Log error message
   * @param {string} message - Log message
   * @param {Object|Error} data - Additional data or Error object
   */
  error(message, data = {}) {
    if (data instanceof Error) {
      data = {
        error: {
          name: data.name,
          message: data.message,
          stack: data.stack
        }
      };
    }
    this.log('error', message, data);
  }

  /**
   * Log warning message
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  warn(message, data = {}) {
    this.log('warn', message, data);
  }

  /**
   * Log info message
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  info(message, data = {}) {
    this.log('info', message, data);
  }

  /**
   * Log debug message
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  debug(message, data = {}) {
    this.log('debug', message, data);
  }

  /**
   * Create a child logger with a sub-namespace
   * @param {string} subname - Sub-namespace
   * @returns {Logger} Child logger
   */
  child(subname) {
    return new Logger(`${this.name}:${subname}`, this.config);
  }

  /**
   * Close file stream
   */
  async close() {
    if (this.fileStream) {
      return new Promise((resolve) => {
        this.fileStream.end(resolve);
      });
    }
  }
}

// Logger registry for caching
const loggers = new Map();

/**
 * Get or create a logger instance
 * @param {string} name - Logger name
 * @param {Object} config - Logger configuration
 * @returns {Logger} Logger instance
 */
function getLogger(name, config = {}) {
  const cacheKey = `${name}:${JSON.stringify(config)}`;

  if (!loggers.has(cacheKey)) {
    loggers.set(cacheKey, new Logger(name, config));
  }

  return loggers.get(cacheKey);
}

/**
 * Create a logger for a module
 * @param {string} moduleName - Module name
 * @returns {Logger} Logger instance
 */
function createLogger(moduleName) {
  return getLogger(moduleName);
}

/**
 * Set global log level
 * @param {string} level - Log level (error, warn, info, debug)
 */
function setLevel(level) {
  if (LOG_LEVELS[level] !== undefined) {
    process.env.LOG_LEVEL = level;
    // Update all cached loggers
    for (const logger of loggers.values()) {
      logger.level = LOG_LEVELS[level];
      logger.config.level = level;
    }
  }
}

/**
 * Close all loggers
 */
async function closeAll() {
  const closePromises = [];
  for (const logger of loggers.values()) {
    closePromises.push(logger.close());
  }
  await Promise.all(closePromises);
  loggers.clear();
}

module.exports = {
  Logger,
  getLogger,
  createLogger,
  setLevel,
  closeAll,
  LOG_LEVELS
};
