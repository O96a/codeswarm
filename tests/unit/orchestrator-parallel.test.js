const Orchestrator = require('../../src/orchestrator');
const { ParallelExecutor } = require('../../src/parallel-executor');
const fs = require('fs-extra');
const path = require('path');
const yaml = require('yaml');

// Mock ui-formatter — it depends on boxen@8 (ESM-only) which Jest can't load
jest.mock('../../ui-formatter', () => ({
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
    icons: { success: '✓', error: '✗', warning: '⚠', info: 'ℹ', run: '▶', done: '●', arrow: '→', bullet: '•', check: '✔', cross: '✖', star: '★', rocket: '🚀', gear: '⚙' },
}));

jest.mock('fs-extra');
jest.mock('../../git-manager', () => {
    return jest.fn().mockImplementation(() => ({
        initialize: jest.fn().mockResolvedValue(true)
    }));
});
jest.mock('../../agent-runner', () => {
    return jest.fn().mockImplementation(() => ({
        execute: jest.fn()
    }));
});
jest.mock('../../src/report-generator');
jest.mock('../../src/safety-manager');
jest.mock('../../coordination-hub', () => {
    return jest.fn().mockImplementation(() => ({
        initialize: jest.fn().mockResolvedValue(true),
        registerAgent: jest.fn().mockResolvedValue(true)
    }));
});
jest.mock('../../src/metrics-collector');
jest.mock('../../src/schema-validator');

describe('Orchestrator Parallel Execution', () => {
    let orchestrator;
    const mockConfig = {
        model: 'test-model',
        ollama_url: 'http://localhost:11434',
        llm: {
            default_provider: 'claude-code',
            providers: {}
        },
        execution: {
            parallel_agents: 3
        },
        safety: {
            require_tests: false,
            rollback_on_failure: false
        }
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock fs-extra for config loading
        fs.pathExists.mockResolvedValue(true);
        fs.readJSON.mockResolvedValue({});
        fs.readFile.mockResolvedValue('name: test\ntype: investigator\ninstructions: test');
        fs.ensureDir.mockResolvedValue();
        fs.writeJSON.mockResolvedValue();

        orchestrator = new Orchestrator(mockConfig);
    });

    describe('Initialization', () => {
        test('initializes parallelExecutor correctly', () => {
            expect(orchestrator.parallelExecutor).toBeInstanceOf(ParallelExecutor);
            expect(orchestrator.parallelExecutor.maxParallel).toBe(3);
        });
    });

    describe('executeParallelAgents()', () => {
        test('calls parallelExecutor.executeParallel with correct tasks', async () => {
            const executeSpy = jest.spyOn(orchestrator.parallelExecutor, 'executeParallel')
                .mockResolvedValue([
                    { status: 'fulfilled', value: { success: true } },
                    { status: 'fulfilled', value: { success: true } }
                ]);

            const agents = ['agent1', 'agent2'];
            const options = { test: true };

            await orchestrator.executeParallelAgents(agents, options);

            expect(executeSpy).toHaveBeenCalledWith([
                { agentName: 'agent1', options: { ...options, coordinationHub: orchestrator.coordinationHub } },
                { agentName: 'agent2', options: { ...options, coordinationHub: orchestrator.coordinationHub } }
            ]);
        });
    });

    describe('runWorkflow() with parallel steps', () => {
        test('executes parallel steps correctly', async () => {
            const workflow = {
                name: 'test-workflow',
                steps: [
                    {
                        name: 'step1',
                        type: 'parallel',
                        agents: ['agent1', 'agent2'],
                        stop_on_failure: true
                    }
                ]
            };

            // Mock loadWorkflow
            jest.spyOn(orchestrator, 'loadWorkflow').mockResolvedValue(workflow);

            // Mock executeParallelAgents
            const executeParallelSpy = jest.spyOn(orchestrator, 'executeParallelAgents')
                .mockResolvedValue([
                    { success: true, agentName: 'agent1' },
                    { success: true, agentName: 'agent2' }
                ]);

            const results = await orchestrator.runWorkflow('test-workflow');

            expect(executeParallelSpy).toHaveBeenCalledWith(['agent1', 'agent2'], expect.any(Object));
            expect(results).toHaveLength(1);
            expect(results[0].step).toBe('step1');
            expect(results[0].results).toHaveLength(2);
        });

        test('stops on failure if stop_on_failure is true', async () => {
            const workflow = {
                name: 'test-workflow',
                steps: [
                    {
                        name: 'step1',
                        type: 'parallel',
                        agents: ['agent1', 'agent2'],
                        stop_on_failure: true
                    },
                    {
                        name: 'step2',
                        type: 'agent',
                        agent: 'agent3'
                    }
                ]
            };

            jest.spyOn(orchestrator, 'loadWorkflow').mockResolvedValue(workflow);

            // Mock failure in parallel step
            jest.spyOn(orchestrator, 'executeParallelAgents').mockResolvedValue([
                { success: false, agentName: 'agent1', error: 'Failed' },
                { success: true, agentName: 'agent2' }
            ]);

            const runAgentSpy = jest.spyOn(orchestrator, 'runAgent');

            const results = await orchestrator.runWorkflow('test-workflow');

            expect(results).toHaveLength(1); // Only first step executed
            expect(runAgentSpy).not.toHaveBeenCalled(); // Second step skipped
        });
    });
});
