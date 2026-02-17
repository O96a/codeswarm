const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const { createHash } = require('crypto');

/**
 * HooksCollector - Captures agent interaction data for learning
 * 
 * Intercepts and logs:
 * - Agent execution events (start, complete, failure)
 * - File operations (read, write, create, delete)
 * - Command executions (tests, builds, linting)
 * - Coordination events (findings, issues, handoffs)
 * 
 * Data is stored for SONA learner to improve routing decisions.
 */
class HooksCollector {
  constructor(sessionDir, config = {}) {
    this.sessionDir = sessionDir;
    this.hooksDir = path.join(sessionDir, 'hooks');
    this.enabled = config.enabled !== false;
    this.config = {
      captureFileOperations: config.capture_file_operations !== false,
      captureCommands: config.capture_commands !== false,
      captureCoordination: config.capture_coordination !== false,
      filterSensitive: config.filter_sensitive !== false,
      ...config
    };

    // Event buffers (written to disk periodically)
    this.eventBuffer = [];
    this.fileOpsBuffer = [];
    this.commandsBuffer = [];
    this.coordinationBuffer = [];

    // Sensitive data patterns to filter
    this.sensitivePatterns = [
      { pattern: /api[_-]?key[=:\s]+[^\s&]+/gi, replacement: 'api_key=[REDACTED]' },
      { pattern: /secret[=:\s]+[^\s&]+/gi, replacement: 'secret=[REDACTED]' },
      { pattern: /password[=:\s]+[^\s&]+/gi, replacement: 'password=[REDACTED]' },
      { pattern: /token[=:\s]+[^\s&]+/gi, replacement: 'token=[REDACTED]' },
      { pattern: /bearer\s+[a-zA-Z0-9_\-\.]+/gi, replacement: 'bearer [REDACTED]' },
      { pattern: /authorization:\s*[^\s]+/gi, replacement: 'authorization: [REDACTED]' },
      { pattern: /auth[_-]?token[=:\s]+[^\s&]+/gi, replacement: 'auth_token=[REDACTED]' }
    ];

    // Statistics
    this.stats = {
      totalEvents: 0,
      eventsByType: {},
      lastFlush: Date.now()
    };
  }

  /**
   * Initialize hooks system
   */
  async initialize() {
    if (!this.enabled) {
      return;
    }

    await fs.ensureDir(this.hooksDir);
    
    // Create event log files
    this.eventsPath = path.join(this.hooksDir, 'events.jsonl');
    this.fileOpsPath = path.join(this.hooksDir, 'file-ops.jsonl');
    this.commandsPath = path.join(this.hooksDir, 'commands.jsonl');
    this.coordinationPath = path.join(this.hooksDir, 'coordination.jsonl');

    // Ensure files exist
    await Promise.all([
      fs.ensureFile(this.eventsPath),
      fs.ensureFile(this.fileOpsPath),
      fs.ensureFile(this.commandsPath),
      fs.ensureFile(this.coordinationPath)
    ]);

    // Setup periodic flush (every 5 seconds)
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  /**
   * Capture an event
   * @param {string} eventType - Type of event (agent:start, file:read, etc.)
   * @param {Object} data - Event data
   * @param {Object} context - Additional context
   */
  async captureEvent(eventType, data, context = {}) {
    if (!this.enabled) {
      return;
    }

    const event = {
      event: eventType,
      timestamp: Date.now(),
      ...data,
      context: this.filterSensitiveData(context)
    };

    // Add to appropriate buffer
    this.eventBuffer.push(event);
    this.stats.totalEvents++;
    this.stats.eventsByType[eventType] = (this.stats.eventsByType[eventType] || 0) + 1;

    // Route to specialized buffers
    if (eventType.startsWith('file:')) {
      this.fileOpsBuffer.push(event);
    } else if (eventType.startsWith('command:')) {
      this.commandsBuffer.push(event);
    } else if (eventType.startsWith('coordination:')) {
      this.coordinationBuffer.push(event);
    }

    // Flush if buffer is large (>100 events)
    if (this.eventBuffer.length > 100) {
      await this.flush();
    }

    return event;
  }

  /**
   * Capture agent start event
   */
  async captureAgentStart(agentId, agentName, task, metadata = {}) {
    return await this.captureEvent('agent:start', {
      agentId,
      agentName,
      task: this.truncateTask(task),
      taskHash: this.hashTask(task),
      ...metadata
    });
  }

  /**
   * Capture agent completion event
   */
  async captureAgentComplete(agentId, agentName, result, metadata = {}) {
    return await this.captureEvent('agent:complete', {
      agentId,
      agentName,
      success: result.success,
      duration: result.duration,
      filesModified: result.filesModified || 0,
      testsRun: result.testsRun,
      issuesFound: result.issuesFound || 0,
      issuesResolved: result.issuesResolved || 0,
      ...metadata
    });
  }

  /**
   * Capture file operation
   */
  async captureFileOperation(operation, filePath, metadata = {}) {
    if (!this.config.captureFileOperations) {
      return;
    }

    return await this.captureEvent(`file:${operation}`, {
      filePath: this.sanitizePath(filePath),
      operation,
      fileExtension: path.extname(filePath),
      ...metadata
    });
  }

  /**
   * Capture command execution
   */
  async captureCommand(command, executor, metadata = {}) {
    if (!this.config.captureCommands) {
      return executor();
    }

    const startTime = Date.now();
    let result;
    let error;
    let success = false;

    try {
      result = await executor();
      success = true;
    } catch (err) {
      error = err;
      success = false;
    }

    const duration = Date.now() - startTime;

    await this.captureEvent('command:execute', {
      command: this.filterSensitiveData(command),
      exitCode: result?.exitCode ?? (error ? 1 : 0),
      duration,
      success,
      output: result?.output ? this.truncateOutput(this.filterSensitiveData(result.output)) : undefined,
      error: error ? this.filterSensitiveData(error.message) : undefined,
      ...metadata
    });

    if (error) {
      throw error;
    }

    return result;
  }

  /**
   * Capture coordination event
   */
  async captureCoordinationEvent(eventType, data, metadata = {}) {
    if (!this.config.captureCoordination) {
      return;
    }

    return await this.captureEvent(`coordination:${eventType}`, {
      coordinationType: eventType,
      ...data,
      ...metadata
    });
  }

  /**
   * Wrap file system to auto-capture operations
   */
  wrapFileSystem(fsModule) {
    if (!this.config.captureFileOperations) {
      return fsModule;
    }

    const self = this;
    const wrapped = Object.create(fsModule);

    // Wrap read operations
    const originalReadFile = fsModule.readFile;
    wrapped.readFile = async function(filePath, ...args) {
      await self.captureFileOperation('read', filePath, {
        method: 'readFile'
      });
      return originalReadFile.call(fsModule, filePath, ...args);
    };

    // Wrap write operations
    const originalWriteFile = fsModule.writeFile;
    wrapped.writeFile = async function(filePath, ...args) {
      const exists = await fsModule.pathExists(filePath);
      await self.captureFileOperation(exists ? 'modify' : 'create', filePath, {
        method: 'writeFile',
        size: Buffer.byteLength(args[0])
      });
      return originalWriteFile.call(fsModule, filePath, ...args);
    };

    // Wrap remove operations
    const originalRemove = fsModule.remove;
    wrapped.remove = async function(filePath, ...args) {
      await self.captureFileOperation('delete', filePath, {
        method: 'remove'
      });
      return originalRemove.call(fsModule, filePath, ...args);
    };

    return wrapped;
  }

  /**
   * Filter sensitive data from strings and objects
   */
  filterSensitiveData(data) {
    if (!this.config.filterSensitive) {
      return data;
    }

    if (typeof data === 'string') {
      let filtered = data;
      for (const { pattern, replacement } of this.sensitivePatterns) {
        filtered = filtered.replace(pattern, replacement);
      }
      return filtered;
    }

    if (typeof data === 'object' && data !== null) {
      const filtered = {};
      for (const [key, value] of Object.entries(data)) {
        // Check if key itself is sensitive
        const keyIsSensitive = ['api_key', 'apikey', 'secret', 'password', 'token', 'auth_token', 'authtoken'].some(
          sensitive => key.toLowerCase().includes(sensitive)
        );
        
        if (keyIsSensitive) {
          filtered[key] = '[REDACTED]';
        } else {
          filtered[key] = this.filterSensitiveData(value);
        }
      }
      return filtered;
    }

    return data;
  }

  /**
   * Flush event buffers to disk
   */
  async flush() {
    if (this.eventBuffer.length === 0) {
      return;
    }

    try {
      // Write all events
      if (this.eventBuffer.length > 0) {
        const lines = this.eventBuffer.map(e => JSON.stringify(e)).join('\n') + '\n';
        await fs.appendFile(this.eventsPath, lines);
      }

      // Write specialized buffers
      if (this.fileOpsBuffer.length > 0) {
        const lines = this.fileOpsBuffer.map(e => JSON.stringify(e)).join('\n') + '\n';
        await fs.appendFile(this.fileOpsPath, lines);
      }

      if (this.commandsBuffer.length > 0) {
        const lines = this.commandsBuffer.map(e => JSON.stringify(e)).join('\n') + '\n';
        await fs.appendFile(this.commandsPath, lines);
      }

      if (this.coordinationBuffer.length > 0) {
        const lines = this.coordinationBuffer.map(e => JSON.stringify(e)).join('\n') + '\n';
        await fs.appendFile(this.coordinationPath, lines);
      }

      // Clear buffers
      this.eventBuffer = [];
      this.fileOpsBuffer = [];
      this.commandsBuffer = [];
      this.coordinationBuffer = [];
      this.stats.lastFlush = Date.now();

    } catch (error) {
      console.error(chalk.yellow(`⚠ Failed to flush hooks events: ${error.message}`));
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      bufferSize: this.eventBuffer.length,
      enabled: this.enabled
    };
  }

  /**
   * Read events from log files
   */
  async readEvents(options = {}) {
    const { type, limit, fromTimestamp } = options;
    
    let filePath = this.eventsPath;
    if (type === 'file-ops') filePath = this.fileOpsPath;
    else if (type === 'commands') filePath = this.commandsPath;
    else if (type === 'coordination') filePath = this.coordinationPath;

    if (!await fs.pathExists(filePath)) {
      return [];
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l);
    
    let events = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(e => e !== null);

    // Filter by timestamp
    if (fromTimestamp) {
      events = events.filter(e => e.timestamp >= fromTimestamp);
    }

    // Limit results
    if (limit) {
      events = events.slice(-limit);
    }

    return events;
  }

  /**
   * Cleanup - flush and stop
   */
  async cleanup() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flush();
  }

  // Helper methods

  truncateTask(task) {
    if (typeof task !== 'string') return '';
    return task.length > 500 ? task.substring(0, 500) + '...' : task;
  }

  truncateOutput(output) {
    if (typeof output !== 'string') return '';
    return output.length > 1000 ? output.substring(0, 1000) + '...' : output;
  }

  hashTask(task) {
    return createHash('sha256').update(task).digest('hex').substring(0, 16);
  }

  sanitizePath(filePath) {
    // Remove absolute paths, keep relative
    const cwd = process.cwd();
    return filePath.replace(cwd, '').replace(/^\//, '');
  }
}

module.exports = HooksCollector;
