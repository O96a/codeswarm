const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const HooksCollector = require('../../hooks-collector');

describe('HooksCollector', () => {
  let tempDir;
  let sessionDir;
  let collector;

  beforeEach(async () => {
    // Create temp directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mehaisi-hooks-test-'));
    sessionDir = path.join(tempDir, 'test-session');
    await fs.ensureDir(sessionDir);

    collector = new HooksCollector(sessionDir, { enabled: true });
    await collector.initialize();
  });

  afterEach(async () => {
    if (collector && collector.flushInterval) {
      await collector.cleanup();
    }
    await fs.remove(tempDir);
  });

  describe('Initialization', () => {
    test('should create hooks directory structure', async () => {
      const hooksDir = path.join(sessionDir, 'hooks');
      expect(await fs.pathExists(hooksDir)).toBe(true);
    });

    test('should create event log files', async () => {
      const files = ['events.jsonl', 'file-ops.jsonl', 'commands.jsonl', 'coordination.jsonl'];
      
      for (const file of files) {
        const filePath = path.join(sessionDir, 'hooks', file);
        expect(await fs.pathExists(filePath)).toBe(true);
      }
    });

    test('should initialize disabled collector without errors', async () => {
      const disabled = new HooksCollector(sessionDir, { enabled: false });
      await disabled.initialize();
      expect(disabled.enabled).toBe(false);
    });
  });

  describe('Event Capture', () => {
    test('should capture basic events', async () => {
      const event = await collector.captureEvent('test:event', {
        data: 'test data'
      });

      expect(event).toBeDefined();
      expect(event.event).toBe('test:event');
      expect(event.timestamp).toBeDefined();
      expect(event.data).toBe('test data');
    });

    test('should not capture events when disabled', async () => {
      const disabled = new HooksCollector(sessionDir, { enabled: false });
      await disabled.initialize();
      
      const event = await disabled.captureEvent('test:event', { data: 'test' });
      
      expect(event).toBeUndefined();
    });

    test('should increment event statistics', async () => {
      await collector.captureEvent('test:event1', {});
      await collector.captureEvent('test:event2', {});
      await collector.captureEvent('test:event1', {});

      const stats = collector.getStats();
      
      expect(stats.totalEvents).toBe(3);
      expect(stats.eventsByType['test:event1']).toBe(2);
      expect(stats.eventsByType['test:event2']).toBe(1);
    });

    test('should buffer events before flushing', async () => {
      await collector.captureEvent('test:event', { data: 'test' });

      expect(collector.eventBuffer.length).toBeGreaterThan(0);
    });

    test('should auto-flush when buffer exceeds 100 events', async () => {
      for (let i = 0; i < 101; i++) {
        await collector.captureEvent('test:event', { index: i });
      }

      // Buffer should be empty after auto-flush
      expect(collector.eventBuffer.length).toBeLessThan(101);
    });
  });

  describe('Agent Events', () => {
    test('should capture agent start event', async () => {
      const event = await collector.captureAgentStart(
        'agent-123',
        'test-agent',
        'Find all security issues in the codebase',
        { capability: 'security-analysis' }
      );

      expect(event.event).toBe('agent:start');
      expect(event.agentId).toBe('agent-123');
      expect(event.agentName).toBe('test-agent');
      expect(event.task).toBeDefined();
      expect(event.taskHash).toBeDefined();
      expect(event.capability).toBe('security-analysis');
    });

    test('should truncate long task descriptions', async () => {
      const longTask = 'x'.repeat(600);
      const event = await collector.captureAgentStart('agent-123', 'test-agent', longTask);

      expect(event.task.length).toBeLessThanOrEqual(503); // 500 + '...'
    });

    test('should capture agent completion event', async () => {
      const result = {
        success: true,
        duration: 5000,
        filesModified: 3,
        testsRun: true,
        issuesFound: 5,
        issuesResolved: 2
      };

      const event = await collector.captureAgentComplete('agent-123', 'test-agent', result);

      expect(event.event).toBe('agent:complete');
      expect(event.success).toBe(true);
      expect(event.duration).toBe(5000);
      expect(event.filesModified).toBe(3);
      expect(event.issuesFound).toBe(5);
      expect(event.issuesResolved).toBe(2);
    });
  });

  describe('File Operations', () => {
    test('should capture file read operations', async () => {
      const event = await collector.captureFileOperation('read', '/src/api/auth.js');

      expect(event.event).toBe('file:read');
      expect(event.operation).toBe('read');
      expect(event.fileExtension).toBe('.js');
    });

    test('should capture file write operations', async () => {
      const event = await collector.captureFileOperation('modify', '/src/api/auth.js', {
        linesChanged: 15
      });

      expect(event.event).toBe('file:modify');
      expect(event.linesChanged).toBe(15);
    });

    test('should sanitize file paths', async () => {
      const event = await collector.captureFileOperation('read', process.cwd() + '/src/file.js');

      expect(event.filePath).not.toContain(process.cwd());
      expect(event.filePath).toBe('src/file.js');
    });

    test('should not capture file operations when disabled', async () => {
      const noFiles = new HooksCollector(sessionDir, {
        enabled: true,
        capture_file_operations: false
      });
      await noFiles.initialize();

      const event = await noFiles.captureFileOperation('read', '/src/file.js');

      expect(event).toBeUndefined();
    });

    test('should route file operations to file-ops buffer', async () => {
      await collector.captureFileOperation('read', '/src/file.js');
      await collector.flush();

      const events = await collector.readEvents({ type: 'file-ops' });
      expect(events.length).toBe(1);
      expect(events[0].event).toBe('file:read');
    });
  });

  describe('Command Execution', () => {
    test('should capture successful command execution', async () => {
      const executor = async () => ({ exitCode: 0, output: 'Tests passed' });

      const result = await collector.captureCommand('npm test', executor, {
        agentId: 'agent-123'
      });

      expect(result.exitCode).toBe(0);
      
      await collector.flush();
      const events = await collector.readEvents({ type: 'commands' });
      expect(events.length).toBe(1);
      expect(events[0].command).toBe('npm test');
      expect(events[0].success).toBe(true);
    });

    test('should capture failed command execution', async () => {
      const executor = async () => {
        throw new Error('Tests failed');
      };

      await expect(
        collector.captureCommand('npm test', executor)
      ).rejects.toThrow('Tests failed');

      await collector.flush();
      const events = await collector.readEvents({ type: 'commands' });
      expect(events.length).toBe(1);
      expect(events[0].success).toBe(false);
    });

    test('should truncate long command output', async () => {
      const longOutput = 'x'.repeat(1500);
      const executor = async () => ({ exitCode: 0, output: longOutput });

      await collector.captureCommand('long command', executor);
      await collector.flush();

      const events = await collector.readEvents({ type: 'commands' });
      expect(events[0].output.length).toBeLessThanOrEqual(1003);
    });

    test('should not capture commands when disabled', async () => {
      const noCommands = new HooksCollector(sessionDir, {
        enabled: true,
        capture_commands: false
      });
      await noCommands.initialize();

      const executor = async () => ({ exitCode: 0 });
      await noCommands.captureCommand('test', executor);

      await noCommands.flush();
      const events = await noCommands.readEvents({ type: 'commands' });
      expect(events.length).toBe(0);
    });
  });

  describe('Coordination Events', () => {
    test('should capture coordination events', async () => {
      await collector.captureCoordinationEvent('finding-shared', {
        agentId: 'agent-123',
        findingType: 'security-issue'
      });

      await collector.flush();
      const events = await collector.readEvents({ type: 'coordination' });
      
      expect(events.length).toBe(1);
      expect(events[0].event).toBe('coordination:finding-shared');
      expect(events[0].coordinationType).toBe('finding-shared');
    });

    test('should not capture coordination when disabled', async () => {
      const noCoord = new HooksCollector(sessionDir, {
        enabled: true,
        capture_coordination: false
      });
      await noCoord.initialize();

      await noCoord.captureCoordinationEvent('test', {});

      await noCoord.flush();
      const events = await noCoord.readEvents({ type: 'coordination' });
      expect(events.length).toBe(0);
    });
  });

  describe('Sensitive Data Filtering', () => {
    test('should filter API keys from strings', () => {
      const filtered = collector.filterSensitiveData('api_key=sk-1234567890');
      expect(filtered).toContain('[REDACTED]');
      expect(filtered).not.toContain('sk-1234567890');
    });

    test('should filter passwords from strings', () => {
      const filtered = collector.filterSensitiveData('password=secret123');
      expect(filtered).toContain('[REDACTED]');
    });

    test('should filter tokens from strings', () => {
      const filtered = collector.filterSensitiveData('auth_token=abc123');
      expect(filtered).toContain('[REDACTED]');
    });

    test('should filter bearer tokens', () => {
      const filtered = collector.filterSensitiveData('Authorization: Bearer xyz789');
      expect(filtered).toContain('[REDACTED]');
    });

    test('should filter sensitive keys from objects', () => {
      const data = {
        username: 'user',
        api_key: 'secret',
        password: 'password123'
      };

      const filtered = collector.filterSensitiveData(data);
      
      expect(filtered.username).toBe('user');
      expect(filtered.api_key).toBe('[REDACTED]');
      expect(filtered.password).toBe('[REDACTED]');
    });

    test('should handle nested objects', () => {
      const data = {
        config: {
          api_key: 'secret',
          url: 'https://api.example.com'
        }
      };

      const filtered = collector.filterSensitiveData(data);
      
      expect(filtered.config.api_key).toBe('[REDACTED]');
      expect(filtered.config.url).toBe('https://api.example.com');
    });

    test('should not filter when disabled', () => {
      const noFilter = new HooksCollector(sessionDir, {
        enabled: true,
        filter_sensitive: false
      });

      const filtered = noFilter.filterSensitiveData('api_key=secret');
      expect(filtered).toBe('api_key=secret');
    });
  });

  describe('Event Reading', () => {
    test('should read all events from log', async () => {
      await collector.captureEvent('test:event1', { data: 1 });
      await collector.captureEvent('test:event2', { data: 2 });
      await collector.flush();

      const events = await collector.readEvents();
      
      expect(events.length).toBe(2);
      expect(events[0].data).toBe(1);
      expect(events[1].data).toBe(2);
    });

    test('should limit number of events returned', async () => {
      for (let i = 0; i < 10; i++) {
        await collector.captureEvent('test:event', { index: i });
      }
      await collector.flush();

      const events = await collector.readEvents({ limit: 5 });
      
      expect(events.length).toBe(5);
      expect(events[4].index).toBe(9); // Last 5 events
    });

    test('should filter events by timestamp', async () => {
      const startTime = Date.now();
      
      await collector.captureEvent('old:event', {});
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const filterTime = Date.now();
      
      await collector.captureEvent('new:event', {});
      await collector.flush();

      const events = await collector.readEvents({ fromTimestamp: filterTime });
      
      expect(events.length).toBe(1);
      expect(events[0].event).toBe('new:event');
    });

    test('should return empty array for non-existent files', async () => {
      const newCollector = new HooksCollector(path.join(tempDir, 'new-session'));
      const events = await newCollector.readEvents();
      
      expect(events).toEqual([]);
    });
  });

  describe('File System Wrapper', () => {
    test('should wrap readFile to capture reads', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFile, 'content');

      const wrappedFs = collector.wrapFileSystem(fs);
      await wrappedFs.readFile(testFile);

      await collector.flush();
      const events = await collector.readEvents({ type: 'file-ops' });
      
      expect(events.length).toBe(1);
      expect(events[0].operation).toBe('read');
    });

    test('should wrap writeFile to capture creates', async () => {
      const testFile = path.join(tempDir, 'new-file.txt');

      const wrappedFs = collector.wrapFileSystem(fs);
      await wrappedFs.writeFile(testFile, 'content');

      await collector.flush();
      const events = await collector.readEvents({ type: 'file-ops' });
      
      const createEvent = events.find(e => e.operation === 'create');
      expect(createEvent).toBeDefined();
    });

    test('should wrap writeFile to capture modifies', async () => {
      const testFile = path.join(tempDir, 'existing.txt');
      await fs.writeFile(testFile, 'original');

      const wrappedFs = collector.wrapFileSystem(fs);
      await wrappedFs.writeFile(testFile, 'modified');

      await collector.flush();
      const events = await collector.readEvents({ type: 'file-ops' });
      
      const modifyEvent = events.find(e => e.operation === 'modify');
      expect(modifyEvent).toBeDefined();
    });

    test('should return unwrapped fs when capture disabled', () => {
      const noFiles = new HooksCollector(sessionDir, {
        enabled: true,
        capture_file_operations: false
      });

      const wrappedFs = noFiles.wrapFileSystem(fs);
      
      expect(wrappedFs).toBe(fs);
    });
  });

  describe('Statistics', () => {
    test('should track event statistics', () => {
      const stats = collector.getStats();
      
      expect(stats.totalEvents).toBe(0);
      expect(stats.eventsByType).toBeDefined();
      expect(stats.bufferSize).toBe(0);
      expect(stats.enabled).toBe(true);
    });

    test('should update statistics on event capture', async () => {
      await collector.captureEvent('test:event', {});
      
      const stats = collector.getStats();
      
      expect(stats.totalEvents).toBe(1);
      expect(stats.bufferSize).toBe(1);
    });
  });

  describe('Cleanup', () => {
    test('should flush events on cleanup', async () => {
      await collector.captureEvent('test:event', { data: 'test' });
      
      expect(collector.eventBuffer.length).toBeGreaterThan(0);
      
      await collector.cleanup();
      
      expect(collector.eventBuffer.length).toBe(0);
    });

    test('should clear flush interval on cleanup', async () => {
      expect(collector.flushInterval).toBeDefined();
      
      await collector.cleanup();
      
      expect(collector.flushInterval).toBeNull();
    });
  });
});
