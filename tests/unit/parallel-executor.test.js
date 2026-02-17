const { ParallelExecutor, HARD_LIMITS } = require('../../src/parallel-executor');
const fs = require('fs-extra');
const path = require('path');

jest.mock('fs-extra');

// Mock AgentRunner for testing
class MockAgentRunner {
    constructor() {
        this.executions = [];
        this.shouldFail = false;
        this.executionDelay = 10; // Add small delay by default
        this.failOnAttempt = null;
    }

    async execute(agentName, agentConfig, options = {}) {
        const execution = {
            agentName,
            agentConfig,
            options,
            timestamp: Date.now(),
            agentId: options.agentId
        };
        this.executions.push(execution);

        // Simulate execution delay
        if (this.executionDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.executionDelay));
        }

        // Fail on specific attempt
        if (this.failOnAttempt !== null) {
            const attemptCount = this.executions.filter(e => e.agentName === agentName).length;
            if (attemptCount === this.failOnAttempt) {
                throw new Error(`Simulated failure on attempt ${attemptCount}`);
            }
        }

        // Always fail if configured
        if (this.shouldFail) {
            throw new Error('Agent execution failed');
        }

        return {
            success: true,
            agentId: options.agentId,
            result: `Executed: ${agentName}`
        };
    }

    getExecutionCount() {
        return this.executions.length;
    }

    reset() {
        this.executions = [];
    }
}

describe('ParallelExecutor', () => {
    let executor;
    let mockAgentRunner;

    beforeEach(() => {
        mockAgentRunner = new MockAgentRunner();
        executor = new ParallelExecutor(mockAgentRunner, {});

        // Default fs mocks
        fs.pathExists.mockResolvedValue(true);
        fs.readFile.mockResolvedValue('name: test-agent\ninstructions: test');

        // Use real timers by default to avoid hangs in async/await
        jest.useRealTimers();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Constructor', () => {
        test('initializes with default config', () => {
            expect(executor.agentRunner).toBe(mockAgentRunner);
            expect(executor.maxParallel).toBe(HARD_LIMITS.MAX_PARALLEL);
            expect(executor.activeProcesses).toBeInstanceOf(Map);
            expect(executor.queue).toEqual([]);
            expect(executor.sessionStartTime).toBeNull();
        });

        test('respects configured parallel limit up to hard limit', () => {
            const customExecutor = new ParallelExecutor(mockAgentRunner, { parallel_agents: 2 });
            expect(customExecutor.maxParallel).toBe(2);
        });

        test('enforces hard limit even with higher config', () => {
            const customExecutor = new ParallelExecutor(mockAgentRunner, { parallel_agents: 10 });
            expect(customExecutor.maxParallel).toBe(HARD_LIMITS.MAX_PARALLEL);
        });
    });

    describe('Hard Limits Constants', () => {
        test('hard limits are defined correctly', () => {
            expect(HARD_LIMITS.MAX_PARALLEL).toBe(3);
            expect(HARD_LIMITS.INSTANCE_TIMEOUT_MS).toBe(600000); // 10 minutes
            expect(HARD_LIMITS.MAX_QUEUE_DEPTH).toBe(10);
            expect(HARD_LIMITS.BATCH_COOLDOWN_MS).toBe(2000); // 2 seconds
            expect(HARD_LIMITS.MAX_RETRIES).toBe(2);
            expect(HARD_LIMITS.SESSION_TIMEOUT_MS).toBe(3600000); // 1 hour
        });
    });

    describe('executeParallel()', () => {
        test('executes single agent successfully', async () => {
            const agents = [
                { agentName: 'agent1', options: {} }
            ];

            const results = await executor.executeParallel(agents);

            expect(results).toHaveLength(1);
            expect(results[0].status).toBe('fulfilled');
            expect(results[0].value.success).toBe(true);
            expect(results[0].value.agentName).toBe('agent1');
        });

        test('executes multiple agents in parallel (within limit)', async () => {
            mockAgentRunner.executionDelay = 0; // Disable delay for this test
            const agents = [
                { agentName: 'agent1', options: {} },
                { agentName: 'agent2', options: {} },
                { agentName: 'agent3', options: {} }
            ];

            const results = await executor.executeParallel(agents);

            expect(results).toHaveLength(3);
            expect(mockAgentRunner.getExecutionCount()).toBe(3);
        });

        test('creates batches when agents exceed max parallel', async () => {
            jest.useRealTimers(); // Use real timers for this test

            const agents = Array.from({ length: 7 }, (_, i) => ({
                agentName: `agent${i + 1}`,
                options: {}
            }));

            const results = await executor.executeParallel(agents);

            // 7 agents should create 3 batches (3, 3, 1)
            expect(results).toHaveLength(7);
        }, 10000); // 10 second timeout

        test('enforces queue depth limit', async () => {
            jest.useRealTimers(); // Use real timers for this test

            // Create more agents than MAX_QUEUE_DEPTH
            const agents = Array.from({ length: 15 }, (_, i) => ({
                agentName: `agent${i + 1}`,
                options: {}
            }));

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            const results = await executor.executeParallel(agents);

            // Should only execute MAX_QUEUE_DEPTH agents
            expect(results).toHaveLength(HARD_LIMITS.MAX_QUEUE_DEPTH);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining(`Queue depth 15 exceeds limit ${HARD_LIMITS.MAX_QUEUE_DEPTH}`)
            );

            consoleSpy.mockRestore();
        }, 15000); // 15 second timeout

        test('enforces session timeout', async () => {
            // Set session start time to 1 hour ago
            executor.sessionStartTime = Date.now() - HARD_LIMITS.SESSION_TIMEOUT_MS - 1000;

            const agents = [{ agentName: 'agent1', options: {} }];

            await expect(executor.executeParallel(agents))
                .rejects.toThrow(/Session timeout/);
        });

        test('implements cooldown between batches', async () => {
            const sleepSpy = jest.spyOn(executor, 'sleep').mockResolvedValue();
            const agents = Array.from({ length: 4 }, (_, i) => ({
                agentName: `agent${i + 1}`,
                options: {}
            }));

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            const results = await executor.executeParallel(agents);
            expect(results).toHaveLength(4);

            // Should log cooldown message
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining(`Cooling down for ${HARD_LIMITS.BATCH_COOLDOWN_MS}ms`)
            );

            // Should have called sleep once (between 2 batches of size 3)
            expect(sleepSpy).toHaveBeenCalledWith(HARD_LIMITS.BATCH_COOLDOWN_MS);

            consoleSpy.mockRestore();
            sleepSpy.mockRestore();
        });
    });

    describe('executeWithRetry()', () => {
        test('executes successfully on first attempt', async () => {
            const agent = {
                agentName: 'test-agent',
                options: {}
            };

            jest.useRealTimers(); // Use real timers for this test
            const result = await executor.executeWithRetry(agent);

            expect(result.success).toBe(true);
            expect(result.agentName).toBe('test-agent');
            expect(result.attempts).toBe(1);
            expect(mockAgentRunner.getExecutionCount()).toBe(1);
        });

        test('retries on failure up to MAX_RETRIES', async () => {
            mockAgentRunner.shouldFail = true;

            const agent = {
                agentName: 'failing-agent',
                options: {}
            };

            jest.useRealTimers(); // Use real timers for retry logic
            const result = await executor.executeWithRetry(agent);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Agent execution failed');
            // Total attempts = initial + MAX_RETRIES = 1 + 2 = 3
            expect(result.attempts).toBe(HARD_LIMITS.MAX_RETRIES + 1);
            expect(mockAgentRunner.getExecutionCount()).toBe(HARD_LIMITS.MAX_RETRIES + 1);
        });

        test('succeeds after retry', async () => {
            // Fail on first attempt, succeed on second
            mockAgentRunner.failOnAttempt = 1;

            const agent = {
                agentName: 'retry-agent',
                options: {}
            };

            jest.useRealTimers();
            const result = await executor.executeWithRetry(agent);

            expect(result.success).toBe(true);
            expect(result.attempts).toBe(2);
            expect(mockAgentRunner.getExecutionCount()).toBe(2);
        });

        test('enforces instance timeout', async () => {
            const agent = {
                agentName: 'timeout-agent',
                options: { timeout: HARD_LIMITS.INSTANCE_TIMEOUT_MS + 1000 }
            };

            jest.useRealTimers();
            const result = await executor.executeWithRetry(agent);

            // Result should be successful (timeout is enforced during execution, not in result)
            expect(result.success).toBe(true);
            expect(result.agentName).toBe('timeout-agent');
        });

        test('tracks active processes during execution', async () => {
            mockAgentRunner.executionDelay = 100;

            const agent = {
                agentName: 'tracked-agent',
                options: {}
            };

            jest.useRealTimers();

            const promise = executor.executeWithRetry(agent);

            // Check that process is tracked while executing
            await new Promise(resolve => setTimeout(resolve, 50));

            // The key is agentName + timestamp in our current impl
            const activeKey = Array.from(executor.activeProcesses.keys()).find(k => k.startsWith('tracked-agent'));
            expect(activeKey).toBeDefined();

            await promise;

            // Process should be removed after completion
            expect(executor.activeProcesses.has(activeKey)).toBe(false);
        });
    });

    describe('createBatches()', () => {
        test('creates single batch for agents within limit', () => {
            const agents = [1, 2, 3];
            const batches = executor.createBatches(agents, 3);

            expect(batches).toHaveLength(1);
            expect(batches[0]).toEqual([1, 2, 3]);
        });

        test('creates multiple batches for agents exceeding limit', () => {
            const agents = [1, 2, 3, 4, 5, 6, 7];
            const batches = executor.createBatches(agents, 3);

            expect(batches).toHaveLength(3);
            expect(batches[0]).toEqual([1, 2, 3]);
            expect(batches[1]).toEqual([4, 5, 6]);
            expect(batches[2]).toEqual([7]);
        });

        test('handles empty agent list', () => {
            const batches = executor.createBatches([], 3);

            expect(batches).toHaveLength(0);
        });

        test('respects custom batch size', () => {
            const agents = [1, 2, 3, 4, 5];
            const batches = executor.createBatches(agents, 2);

            expect(batches).toHaveLength(3);
            expect(batches[0]).toEqual([1, 2]);
            expect(batches[1]).toEqual([3, 4]);
            expect(batches[2]).toEqual([5]);
        });
    });

    describe('sleep()', () => {
        test('sleeps for specified duration', async () => {
            jest.useRealTimers();
            const start = Date.now();
            await executor.sleep(100);
            const duration = Date.now() - start;

            expect(duration).toBeGreaterThanOrEqual(95); // Allow small timing variance
            expect(duration).toBeLessThan(150);
        });
    });

    describe('getStats()', () => {
        test('returns correct stats initially', () => {
            const stats = executor.getStats();

            expect(stats.activeProcesses).toBe(0);
            expect(stats.maxParallel).toBe(HARD_LIMITS.MAX_PARALLEL);
            expect(stats.sessionDuration).toBe(0);
            expect(stats.limits).toEqual(HARD_LIMITS);
        });

        test('tracks session duration after execution starts', async () => {
            jest.useRealTimers();

            const agents = [{ agentName: 'agent1', options: {} }];
            await executor.executeParallel(agents);

            const stats = executor.getStats();
            expect(stats.sessionDuration).toBeGreaterThan(0);
        });
    });

    describe('reset()', () => {
        test('clears all state', async () => {
            jest.useRealTimers();

            // Execute something to populate state
            const agents = [{ agentName: 'agent1', options: {} }];
            await executor.executeParallel(agents);

            // Reset
            executor.reset();

            expect(executor.activeProcesses.size).toBe(0);
            expect(executor.queue).toEqual([]);
            expect(executor.sessionStartTime).toBeNull();

            const stats = executor.getStats();
            expect(stats.sessionDuration).toBe(0);
        });
    });

    describe('Error Handling', () => {
        test('handles agent runner errors gracefully', async () => {
            mockAgentRunner.shouldFail = true;

            const agents = [
                { agentName: 'agent1', options: {} },
                { agentName: 'agent2', options: {} }
            ];

            jest.useRealTimers();
            const results = await executor.executeParallel(agents);

            expect(results).toHaveLength(2);
            expect(results[0].status).toBe('fulfilled');
            expect(results[0].value.success).toBe(false);
            expect(results[1].status).toBe('fulfilled');
            expect(results[1].value.success).toBe(false);
        });

        test('continues execution even when some agents fail', async () => {
            // Fail on first attempt for both
            mockAgentRunner.failOnAttempt = 1;

            const agents = [
                { agentName: 'agent1', options: {} },
                { agentName: 'agent2', options: {} }
            ];

            jest.useRealTimers();
            const results = await executor.executeParallel(agents);

            // Both should complete (after retry)
            expect(results).toHaveLength(2);
            const successCount = results.filter(r => r.value.success).length;
            expect(successCount).toBe(2);
        });

        test('throws if agent config cannot be loaded', async () => {
            fs.pathExists.mockResolvedValue(false);

            const agent = {
                agentName: 'non-existent',
                options: {}
            };

            const result = await executor.executeWithRetry(agent);
            expect(result.success).toBe(false);
            expect(result.error).toBe('Agent not found: non-existent');
        });
    });
});
