/**
 * Orchestrator Unit Tests
 */

const Orchestrator = require('../../src/orchestrator');

// Mock dependencies
jest.mock('../../src/ui-formatter', () => ({
  header: jest.fn(),
  section: jest.fn(),
  divider: jest.fn(),
  phase: jest.fn(),
  item: jest.fn(),
  agentStart: jest.fn(),
  progress: jest.fn(),
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
  icons: { success: '✓', error: '✗', warning: '⚠', info: 'ℹ', check: '✔', rocket: '🚀', gear: '⚙' }
}));

jest.mock('../../src/git-manager', () => {
  return jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(true),
    createSnapshot: jest.fn().mockResolvedValue('snapshot-123'),
    getCurrentCommit: jest.fn().mockResolvedValue('abc123'),
    createTag: jest.fn().mockResolvedValue(true),
    rollbackToCommit: jest.fn().mockResolvedValue(true),
    getModifiedFiles: jest.fn().mockResolvedValue({ all: [], created: [], deleted: [] })
  }));
});

jest.mock('../../src/agent-runner', () => {
  return jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue({ success: true, output: 'test output' })
  }));
});

jest.mock('../../src/report-generator', () => {
  return jest.fn().mockImplementation(() => ({
    generateAgentReport: jest.fn().mockResolvedValue(true),
    generatePhaseReport: jest.fn().mockResolvedValue(true),
    generateHTML: jest.fn().mockResolvedValue(true)
  }));
});

jest.mock('../../src/safety-manager', () => {
  return jest.fn().mockImplementation(() => ({
    runPreflightChecks: jest.fn().mockResolvedValue(true),
    captureBaseline: jest.fn().mockResolvedValue(true),
    runTests: jest.fn().mockResolvedValue({ passed: true })
  }));
});

jest.mock('../../src/coordination-hub', () => {
  return jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(true),
    registerAgent: jest.fn().mockResolvedValue(true),
    coordinateStep: jest.fn().mockResolvedValue(true),
    initializeWorkflow: jest.fn().mockResolvedValue(true),
    initializePipeline: jest.fn().mockResolvedValue(true),
    recommendAgentForTask: jest.fn().mockResolvedValue({ agent: { name: 'test-agent' }, confidence: 0.9 })
  }));
});

jest.mock('../../src/metrics-collector', () => {
  return jest.fn().mockImplementation(() => ({
    startSession: jest.fn(),
    completeSession: jest.fn(),
    startAgent: jest.fn().mockReturnValue({ startTime: Date.now() }),
    completeAgent: jest.fn(),
    recordTestExecution: jest.fn(),
    getSummary: jest.fn().mockReturnValue({
      totalAgents: 0,
      successfulAgents: 0,
      failedAgents: 0,
      totalDuration: 0,
      testsRun: 0,
      testsPassed: 0,
      testsFailed: 0,
      issuesFound: 0,
      issuesResolved: 0,
      coordinationActivity: 0
    })
  }));
});

jest.mock('../../src/schema-validator', () => {
  return jest.fn().mockImplementation(() => ({
    validateAgentConfig: jest.fn().mockReturnValue({ valid: true, errors: [] })
  }));
});

jest.mock('../../src/credential-manager', () => {
  return jest.fn().mockImplementation(() => ({
    setupAllCredentials: jest.fn().mockResolvedValue(true)
  }));
});

jest.mock('../../src/llm-provider', () => ({
  LLMProviderManager: jest.fn().mockImplementation(() => ({
    register: jest.fn(),
    execute: jest.fn()
  }))
}));

jest.mock('../../src/providers/ollama-cloud', () => {
  return jest.fn().mockImplementation(() => ({}));
});

jest.mock('../../src/providers/ollama-local', () => {
  return jest.fn().mockImplementation(() => ({}));
});

jest.mock('../../src/providers/claude-code', () => {
  return jest.fn().mockImplementation(() => ({}));
});

jest.mock('../../src/parallel-executor', () => ({
  ParallelExecutor: jest.fn().mockImplementation(() => ({
    executeParallel: jest.fn().mockResolvedValue([])
  }))
}));

jest.mock('fs-extra', () => ({
  ensureDir: jest.fn().mockResolvedValue(true),
  pathExists: jest.fn().mockResolvedValue(true),
  readFile: jest.fn().mockResolvedValue('test content'),
  readJSON: jest.fn().mockResolvedValue({ test: 'data' }),
  writeJSON: jest.fn().mockResolvedValue(true),
  remove: jest.fn().mockResolvedValue(true)
}));

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid-123')
}));

describe('Orchestrator', () => {
  let orchestrator;

  const mockConfig = {
    ollama_url: 'http://localhost:11434',
    model: 'test-model',
    safety: {
      require_tests: false,
      rollback_on_failure: false,
      auto_apply: false
    },
    max_retries: 3,
    llm: {
      providers: {}
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    orchestrator = new Orchestrator(mockConfig);
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      expect(orchestrator.config).toEqual(mockConfig);
      expect(orchestrator.sessionId).toBe('test-uuid-123');
      expect(orchestrator.maxRetries).toBe(3);
    });

    it('should initialize all dependencies', () => {
      expect(orchestrator.gitManager).toBeDefined();
      expect(orchestrator.agentRunner).toBeDefined();
      expect(orchestrator.reportGenerator).toBeDefined();
      expect(orchestrator.safetyManager).toBeDefined();
      expect(orchestrator.coordinationHub).toBeDefined();
      expect(orchestrator.metrics).toBeDefined();
      expect(orchestrator.validator).toBeDefined();
    });

    it('should default max_retries to 3 if not provided', () => {
      const configWithoutRetries = { ...mockConfig, max_retries: undefined };
      const orch = new Orchestrator(configWithoutRetries);
      expect(orch.maxRetries).toBe(3);
    });
  });

  describe('isValidResourceName', () => {
    it('should validate valid resource names', () => {
      expect(orchestrator.isValidResourceName('test-agent')).toBe(true);
      expect(orchestrator.isValidResourceName('test_agent')).toBe(true);
      expect(orchestrator.isValidResourceName('test123')).toBe(true);
      expect(orchestrator.isValidResourceName('Test-Agent-123')).toBe(true);
    });

    it('should reject invalid resource names', () => {
      expect(orchestrator.isValidResourceName('../etc/passwd')).toBe(false);
      expect(orchestrator.isValidResourceName('test/agent')).toBe(false);
      expect(orchestrator.isValidResourceName('test\\agent')).toBe(false);
      expect(orchestrator.isValidResourceName('')).toBe(false);
      expect(orchestrator.isValidResourceName(null)).toBe(false);
      expect(orchestrator.isValidResourceName('test agent')).toBe(false);
    });
  });

  describe('isTransientError', () => {
    it('should identify transient errors', () => {
      expect(orchestrator.isTransientError(new Error('econnreset'))).toBe(true);
      expect(orchestrator.isTransientError(new Error('etimedout'))).toBe(true);
      expect(orchestrator.isTransientError(new Error('network error'))).toBe(true);
      expect(orchestrator.isTransientError(new Error('temporary failure'))).toBe(true);
    });

    it('should identify non-transient errors', () => {
      expect(orchestrator.isTransientError(new Error('invalid input'))).toBe(false);
      expect(orchestrator.isTransientError(new Error('file not found'))).toBe(false);
      expect(orchestrator.isTransientError(new Error('permission denied'))).toBe(false);
    });
  });

  describe('sleep', () => {
    it('should sleep for specified duration', async () => {
      const start = Date.now();
      await orchestrator.sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(95);
    });
  });

  describe('createRollbackPoint', () => {
    it('should create a rollback point', async () => {
      const rollbackPoint = await orchestrator.createRollbackPoint('test-checkpoint');

      expect(rollbackPoint).toHaveProperty('id', 'test-uuid-123');
      expect(rollbackPoint).toHaveProperty('name', 'test-checkpoint');
      expect(rollbackPoint).toHaveProperty('commit', 'abc123');
      expect(rollbackPoint).toHaveProperty('timestamp');
    });

    it('should add rollback point to array', async () => {
      await orchestrator.createRollbackPoint('checkpoint-1');
      expect(orchestrator.rollbackPoints.length).toBe(1);
    });
  });

  describe('runAgent', () => {
    it('should run agent successfully', async () => {
      // Mock loadAgentConfig
      orchestrator.loadAgentConfig = jest.fn().mockResolvedValue({
        name: 'test-agent',
        type: 'investigator',
        instructions: 'test instructions',
        coordination: { enabled: false }
      });

      const result = await orchestrator.runAgent('test-agent');

      expect(result).toEqual({ success: true, output: 'test output' });
      expect(orchestrator.agentRunner.execute).toHaveBeenCalled();
    });

    it('should validate agent config before running', async () => {
      orchestrator.loadAgentConfig = jest.fn().mockResolvedValue({
        name: 'test-agent',
        type: 'investigator',
        instructions: 'test'
      });

      await orchestrator.runAgent('test-agent');

      expect(orchestrator.validator.validateAgentConfig).toHaveBeenCalled();
    });

    it('should throw on invalid agent config', async () => {
      orchestrator.validator.validateAgentConfig = jest.fn().mockReturnValue({
        valid: false,
        errors: ['Missing required field']
      });

      orchestrator.loadAgentConfig = jest.fn().mockResolvedValue({
        name: 'test-agent'
      });

      await expect(orchestrator.runAgent('test-agent'))
        .rejects.toThrow('Invalid agent config');
    });

    it('should retry on transient errors', async () => {
      let attempts = 0;
      orchestrator.agentRunner.execute = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 2) {
          return Promise.reject(new Error('econnreset'));
        }
        return Promise.resolve({ success: true });
      });

      orchestrator.loadAgentConfig = jest.fn().mockResolvedValue({
        name: 'test-agent',
        type: 'investigator',
        instructions: 'test',
        coordination: { enabled: false }
      });

      const result = await orchestrator.runAgent('test-agent');
      expect(result.success).toBe(true);
      expect(attempts).toBe(2);
    });
  });

  describe('runWorkflow', () => {
    it('should run workflow steps', async () => {
      orchestrator.loadWorkflow = jest.fn().mockResolvedValue({
        steps: [
          { name: 'Step 1', type: 'agent', agent: 'test-agent' }
        ],
        coordination_enabled: false
      });

      orchestrator.loadAgentConfig = jest.fn().mockResolvedValue({
        name: 'test-agent',
        type: 'investigator',
        instructions: 'test',
        coordination: { enabled: false }
      });

      const results = await orchestrator.runWorkflow('test-workflow');

      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty('step', 'Step 1');
    });

    it('should use intelligent routing when auto_select_agent is true', async () => {
      orchestrator.loadWorkflow = jest.fn().mockResolvedValue({
        steps: [
          {
            name: 'Step 1',
            type: 'agent',
            agent: 'auto',
            auto_select_agent: true,
            task_description: 'test task'
          }
        ],
        coordination_enabled: false
      });

      orchestrator.loadAgentConfig = jest.fn().mockResolvedValue({
        name: 'test-agent',
        type: 'investigator',
        instructions: 'test',
        coordination: { enabled: false }
      });

      await orchestrator.runWorkflow('test-workflow');

      expect(orchestrator.coordinationHub.recommendAgentForTask).toHaveBeenCalled();
    });

    it('should stop workflow on failure when stop_on_failure is true', async () => {
      orchestrator.loadWorkflow = jest.fn().mockResolvedValue({
        steps: [
          { name: 'Step 1', type: 'agent', agent: 'fail-agent', stop_on_failure: true },
          { name: 'Step 2', type: 'agent', agent: 'next-agent', stop_on_failure: true }
        ],
        coordination_enabled: false
      });

      orchestrator.loadAgentConfig = jest.fn().mockResolvedValue({
        name: 'fail-agent',
        type: 'investigator',
        instructions: 'test',
        coordination: { enabled: false }
      });

      orchestrator.agentRunner.execute = jest.fn().mockResolvedValue({ failed: true });

      const results = await orchestrator.runWorkflow('test-workflow');

      expect(results).toHaveLength(1);
    });
  });

  describe('rollbackToLastCheckpoint', () => {
    it('should rollback to last checkpoint', async () => {
      await orchestrator.createRollbackPoint('checkpoint-1');

      await orchestrator.rollbackToLastCheckpoint();

      expect(orchestrator.gitManager.rollbackToCommit).toHaveBeenCalledWith('abc123');
    });

    it('should handle empty rollback points', async () => {
      await orchestrator.rollbackToLastCheckpoint();
      // Should not throw
    });
  });
});
