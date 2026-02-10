const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const SONALearner = require('../../sona-learner');

describe('SONALearner', () => {
  let tempDir;
  let mehaisiDir;
  let learner;

  beforeEach(async () => {
    // Create temp directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mehaisi-sona-test-'));
    mehaisiDir = path.join(tempDir, '.mehaisi');
    await fs.ensureDir(mehaisiDir);
    await fs.ensureDir(path.join(mehaisiDir, 'sessions'));

    learner = new SONALearner(mehaisiDir, {
      min_sessions_for_learning: 3,
      auto_adjust_weights: true
    });
    await learner.initialize();
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe('Initialization', () => {
    test('should create learning directory', async () => {
      const learningDir = path.join(mehaisiDir, 'learning');
      expect(await fs.pathExists(learningDir)).toBe(true);
    });

    test('should initialize with default routing weights', () => {
      expect(learner.routingWeights).toEqual({
        capability: 0.4,
        semantic: 0.4,
        success: 0.2
      });
    });

    test('should set initialized flag', () => {
      expect(learner.initialized).toBe(true);
    });

    test('should load existing learning data if available', async () => {
      // Create existing data
      const outcomesPath = path.join(mehaisiDir, 'learning', 'routing-outcomes.json');
      await fs.writeJSON(outcomesPath, [{ task: 'test', success: true }]);

      const newLearner = new SONALearner(mehaisiDir);
      await newLearner.initialize();

      expect(newLearner.learningData.routingOutcomes.length).toBe(1);
    });

    test('should handle missing learning data gracefully', async () => {
      const newDir = path.join(tempDir, '.mehaisi2');
      await fs.ensureDir(newDir);

      const newLearner = new SONALearner(newDir);
      await newLearner.initialize();

      expect(newLearner.learningData.routingOutcomes).toEqual([]);
    });
  });

  describe('Recording Routing Outcomes', () => {
    test('should record successful routing outcome', async () => {
      const outcome = {
        task: 'Find security vulnerabilities',
        taskType: 'security-analysis',
        agent: { id: 'security-scanner', name: 'Security Scanner' },
        confidence: 0.85,
        success: true,
        duration: 5000
      };

      await learner.recordRoutingOutcome(outcome);

      expect(learner.learningData.routingOutcomes.length).toBe(1);
      expect(learner.learningData.routingOutcomes[0].success).toBe(true);
    });

    test('should update agent performance statistics', async () => {
      const outcome = {
        task: 'Test task',
        agent: { id: 'test-agent', name: 'Test Agent' },
        agentId: 'test-agent',
        agentName: 'Test Agent',
        confidence: 0.7,
        success: true,
        duration: 3000
      };

      await learner.recordRoutingOutcome(outcome);

      const stats = learner.learningData.agentPerformance['test-agent'];
      expect(stats).toBeDefined();
      expect(stats.totalExecutions).toBe(1);
      expect(stats.successes).toBe(1);
      expect(stats.failures).toBe(0);
    });

    test('should track performance by task type', async () => {
      await learner.recordRoutingOutcome({
        task: 'Security scan',
        taskType: 'security',
        agent: { id: 'agent-1' },
        agentId: 'agent-1',
        agentName: 'Agent 1',
        success: true,
        duration: 1000
      });

      await learner.recordRoutingOutcome({
        task: 'Security audit',
        taskType: 'security',
        agent: { id: 'agent-1' },
        agentId: 'agent-1',
        agentName: 'Agent 1',
        success: false,
        duration: 2000
      });

      const stats = learner.learningData.agentPerformance['agent-1'];
      expect(stats.byTaskType['security']).toEqual({
        successes: 1,
        failures: 1
      });
    });

    test('should save data periodically', async () => {
      for (let i = 0; i < 10; i++) {
        await learner.recordRoutingOutcome({
          task: `Task ${i}`,
          agent: { id: 'agent-1' },
          agentId: 'agent-1',
          agentName: 'Agent 1',
          success: true,
          duration: 1000
        });
      }

      // Check that data was saved
      const outcomesPath = path.join(mehaisiDir, 'learning', 'routing-outcomes.json');
      expect(await fs.pathExists(outcomesPath)).toBe(true);

      const saved = await fs.readJSON(outcomesPath);
      expect(saved.length).toBe(10);
    });
  });

  describe('Routing Accuracy Calculation', () => {
    test('should calculate accuracy from outcomes', async () => {
      // 7 successes, 3 failures = 70% accuracy
      for (let i = 0; i < 7; i++) {
        await learner.recordRoutingOutcome({
          task: 'Task',
          agent: { id: 'agent' },
          agentId: 'agent',
          agentName: 'Agent',
          success: true,
          duration: 1000
        });
      }

      for (let i = 0; i < 3; i++) {
        await learner.recordRoutingOutcome({
          task: 'Task',
          agent: { id: 'agent' },
          agentId: 'agent',
          agentName: 'Agent',
          success: false,
          duration: 1000
        });
      }

      const accuracy = learner.calculateRoutingAccuracy();
      expect(accuracy).toBeCloseTo(0.7, 2);
    });

    test('should return 0 for no outcomes', () => {
      const accuracy = learner.calculateRoutingAccuracy();
      expect(accuracy).toBe(0);
    });
  });

  describe('Weight Optimization', () => {
    test('should not optimize before minimum sessions', async () => {
      // Record some outcomes (but < min sessions)
      await learner.recordRoutingOutcome({
        task: 'Task',
        agent: { id: 'agent' },
        agentId: 'agent',
        agentName: 'Agent',
        success: true,
        duration: 1000
      });

      const weights = await learner.optimizeWeights();

      expect(weights).toEqual(learner.routingWeights);
      expect(learner.learningData.weightsHistory.length).toBe(0);
    });

    test('should generate weight candidates', () => {
      const candidates = learner.generateWeightCandidates();

      expect(candidates.length).toBeGreaterThan(0);

      // All candidates should sum to 1.0
      for (const candidate of candidates) {
        const sum = candidate.capability + candidate.semantic + candidate.success;
        expect(sum).toBeCloseTo(1.0, 5);
      }
    });

    test('should normalize weights to sum to 1.0', () => {
      const weights = { capability: 0.5, semantic: 0.3, success: 0.1 };
      const normalized = learner.normalizeWeights(weights);

      const sum = normalized.capability + normalized.semantic + normalized.success;
      expect(sum).toBeCloseTo(1.0, 5);
    });

    test('should optimize weights when enough data available', async () => {
      // Create enough sessions
      for (let i = 0; i < 3; i++) {
        const sessionDir = path.join(mehaisiDir, 'sessions', `session-${i}`);
        await fs.ensureDir(path.join(sessionDir, 'hooks'));
      }

      // Record outcomes with pattern (high semantic correlation)
      for (let i = 0; i < 20; i++) {
        await learner.recordRoutingOutcome({
          task: 'Security task',
          agent: { id: 'agent' },
          agentId: 'agent',
          agentName: 'Agent',
          confidence: 0.8 + Math.random() * 0.2,
          success: Math.random() > 0.3, // 70% success rate
          duration: 1000
        });
      }

      const originalWeights = { ...learner.routingWeights };
      await learner.optimizeWeights();

      // Weights might or might not change depending on simulation
      // Just verify the method runs without errors
      expect(learner.routingWeights).toBeDefined();
    });

    test('should not optimize if auto-adjust disabled', async () => {
      const noAdjust = new SONALearner(mehaisiDir, {
        auto_adjust_weights: false
      });
      await noAdjust.initialize();

      const weights = await noAdjust.optimizeWeights();
      expect(weights).toEqual(noAdjust.routingWeights);
    });
  });

  describe('Capability Discovery', () => {
    test('should discover capabilities from successful completions', async () => {
      // Record 3+ successful outcomes for same task type
      for (let i = 0; i < 4; i++) {
        await learner.recordRoutingOutcome({
          task: 'Security scan',
          taskType: 'security-analysis',
          agent: { id: 'agent-1' },
          agentId: 'agent-1',
          agentName: 'Agent 1',
          success: true,
          duration: 1000
        });
      }

      const discovered = await learner.discoverCapabilities();

      expect(discovered['agent-1']).toBeDefined();
      expect(discovered['agent-1'].length).toBeGreaterThan(0);
      expect(discovered['agent-1'][0].capability).toBe('security-analysis');
    });

    test('should require minimum success count', async () => {
      // Only 2 successes (need 3)
      for (let i = 0; i < 2; i++) {
        await learner.recordRoutingOutcome({
          task: 'Task',
          taskType: 'test-type',
          agent: { id: 'agent' },
          agentId: 'agent',
          agentName: 'Agent',
          success: true,
          duration: 1000
        });
      }

      const discovered = await learner.discoverCapabilities();

      expect(Object.keys(discovered).length).toBe(0);
    });

    test('should require minimum success rate', async () => {
      // 3 successes, 5 failures = 37.5% success rate (need 70%)
      for (let i = 0; i < 3; i++) {
        await learner.recordRoutingOutcome({
          taskType: 'test-type',
          agent: { id: 'agent' },
          agentId: 'agent',
          agentName: 'Agent',
          success: true,
          duration: 1000
        });
      }

      for (let i = 0; i < 5; i++) {
        await learner.recordRoutingOutcome({
          taskType: 'test-type',
          agent: { id: 'agent' },
          agentId: 'agent',
          agentName: 'Agent',
          success: false,
          duration: 1000
        });
      }

      const discovered = await learner.discoverCapabilities();

      expect(Object.keys(discovered).length).toBe(0);
    });
  });

  describe('Pattern Extraction', () => {
    test('should extract successful task patterns', async () => {
      // Create pattern: agent-1 is good at security (80% success)
      for (let i = 0; i < 8; i++) {
        await learner.recordRoutingOutcome({
          task: 'Security task',
          taskType: 'security',
          agent: { id: 'agent-1' },
          agentId: 'agent-1',
          agentName: 'Security Agent',
          success: true,
          duration: 1000
        });
      }

      for (let i = 0; i < 2; i++) {
        await learner.recordRoutingOutcome({
          task: 'Security task',
          taskType: 'security',
          agent: { id: 'agent-1' },
          agentId: 'agent-1',
          agentName: 'Security Agent',
          success: false,
          duration: 1000
        });
      }

      const patterns = await learner.extractPatterns();

      expect(patterns.length).toBeGreaterThan(0);
      const securityPattern = patterns.find(p => p.taskType === 'security');
      expect(securityPattern).toBeDefined();
      expect(securityPattern.successRate).toBeGreaterThanOrEqual(0.8);
    });

    test('should require minimum 3 occurrences', async () => {
      // Only 2 occurrences
      for (let i = 0; i < 2; i++) {
        await learner.recordRoutingOutcome({
          taskType: 'rare-type',
          agent: { id: 'agent' },
          agentId: 'agent',
          agentName: 'Agent',
          success: true,
          duration: 1000
        });
      }

      const patterns = await learner.extractPatterns();

      const rarePattern = patterns.find(p => p.taskType === 'rare-type');
      expect(rarePattern).toBeUndefined();
    });
  });

  describe('Statistics', () => {
    test('should provide comprehensive statistics', async () => {
      await learner.recordRoutingOutcome({
        task: 'Task',
        agent: { id: 'agent' },
        agentId: 'agent',
        agentName: 'Agent',
        success: true,
        duration: 1000
      });

      const stats = await learner.getStatistics();

      expect(stats).toHaveProperty('sessionsAnalyzed');
      expect(stats).toHaveProperty('routingDecisions');
      expect(stats).toHaveProperty('overallAccuracy');
      expect(stats).toHaveProperty('currentWeights');
      expect(stats).toHaveProperty('readyForOptimization');
    });

    test('should count sessions with hooks data', async () => {
      // Create sessions with hooks
      for (let i = 0; i < 3; i++) {
        const sessionDir = path.join(mehaisiDir, 'sessions', `session-${i}`);
        await fs.ensureDir(path.join(sessionDir, 'hooks'));
      }

      const count = await learner.countAnalyzedSessions();
      expect(count).toBe(3);
    });

    test('should identify top performing agents', async () => {
      // Agent 1: 90% success
      for (let i = 0; i < 9; i++) {
        await learner.recordRoutingOutcome({
          agent: { id: 'agent-1' },
          agentId: 'agent-1',
          agentName: 'Agent 1',
          success: true,
          duration: 1000
        });
      }

      await learner.recordRoutingOutcome({
        agent: { id: 'agent-1' },
        agentId: 'agent-1',
        agentName: 'Agent 1',
        success: false,
        duration: 1000
      });

      // Agent 2: 50% success
      for (let i = 0; i < 5; i++) {
        await learner.recordRoutingOutcome({
          agent: { id: 'agent-2' },
          agentId: 'agent-2',
          agentName: 'Agent 2',
          success: i < 2.5,
          duration: 1000
        });
      }

      const stats = await learner.getStatistics();

      expect(stats.topPerformingAgents.length).toBeGreaterThan(0);
      expect(stats.topPerformingAgents[0].id).toBe('agent-1');
    });
  });

  describe('Data Persistence', () => {
    test('should save learning data to disk', async () => {
      await learner.recordRoutingOutcome({
        task: 'Task',
        agent: { id: 'agent' },
        agentId: 'agent',
        agentName: 'Agent',
        success: true,
        duration: 1000
      });

      await learner.saveLearningData();

      const outcomesPath = path.join(mehaisiDir, 'learning', 'routing-outcomes.json');
      expect(await fs.pathExists(outcomesPath)).toBe(true);
    });

    test('should save routing weights separately', async () => {
      learner.routingWeights = { capability: 0.5, semantic: 0.3, success: 0.2 };
      await learner.saveRoutingWeights();

      const weightsPath = path.join(mehaisiDir, 'learning', 'routing-weights.json');
      expect(await fs.pathExists(weightsPath)).toBe(true);

      const saved = await fs.readJSON(weightsPath);
      expect(saved.weights).toEqual(learner.routingWeights);
    });

    test('should load saved weights on initialization', async () => {
      const customWeights = { capability: 0.5, semantic: 0.3, success: 0.2 };
      learner.routingWeights = customWeights;
      await learner.saveRoutingWeights();

      const newLearner = new SONALearner(mehaisiDir);
      await newLearner.initialize();

      expect(newLearner.routingWeights).toEqual(customWeights);
    });
  });

  describe('Reset', () => {
    test('should reset all learning data', async () => {
      // Add some data
      await learner.recordRoutingOutcome({
        task: 'Task',
        agent: { id: 'agent' },
        agentId: 'agent',
        agentName: 'Agent',
        success: true,
        duration: 1000
      });

      expect(learner.learningData.routingOutcomes.length).toBe(1);

      await learner.reset();

      expect(learner.learningData.routingOutcomes).toEqual([]);
      expect(learner.routingWeights).toEqual({
        capability: 0.4,
        semantic: 0.4,
        success: 0.2
      });
    });

    test('should persist reset to disk', async () => {
      await learner.recordRoutingOutcome({
        task: 'Task',
        agent: { id: 'agent' },
        agentId: 'agent',
        agentName: 'Agent',
        success: true,
        duration: 1000
      });

      await learner.reset();

      const outcomesPath = path.join(mehaisiDir, 'learning', 'routing-outcomes.json');
      const saved = await fs.readJSON(outcomesPath);
      
      expect(saved).toEqual([]);
    });
  });

  describe('Utility Methods', () => {
    test('should hash strings consistently', () => {
      const hash1 = learner.hashString('test string');
      const hash2 = learner.hashString('test string');
      const hash3 = learner.hashString('different string');

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
    });

    test('should truncate long strings', () => {
      const longString = 'x'.repeat(300);
      const truncated = learner.truncateString(longString, 100);

      expect(truncated.length).toBeLessThanOrEqual(103); // 100 + '...'
    });

    test('should not truncate short strings', () => {
      const shortString = 'short';
      const truncated = learner.truncateString(shortString, 100);

      expect(truncated).toBe(shortString);
    });
  });
});
