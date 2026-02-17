const Orchestrator = require('../../src/orchestrator');
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

describe('Parallel Workflow Integration', () => {
    let orchestrator;
    const testDir = path.join(process.cwd(), '.test-mehaisi-parallel');

    const mockConfig = {
        model: 'test-model',
        ollama_url: 'http://localhost:11434',
        llm: {
            default_provider: 'claude-code',
            providers: {
                'claude-code': {
                    module: './providers/claude-code',
                    options: {}
                }
            }
        },
        execution: {
            parallel_agents: 3
        }
    };

    beforeAll(async () => {
        // Setup mock environment
        await fs.ensureDir(testDir);
        await fs.ensureDir(path.join(testDir, 'agents'));
        await fs.ensureDir(path.join(testDir, 'workflows'));

        // Create mock agents
        const agent1 = {
            name: 'agent1',
            type: 'investigator',
            instructions: 'Analyze the code and share your findings.'
        };
        const agent2 = {
            name: 'agent2',
            type: 'security',
            instructions: 'Scan for security issues.'
        };

        await fs.writeFile(path.join(testDir, 'agents', 'agent1.yml'), yaml.stringify(agent1));
        await fs.writeFile(path.join(testDir, 'agents', 'agent2.yml'), yaml.stringify(agent2));

        // Create mock workflow
        const workflow = {
            name: 'parallel-test',
            steps: [
                {
                    name: 'analysis',
                    type: 'parallel',
                    agents: ['agent1', 'agent2']
                }
            ]
        };
        await fs.writeJSON(path.join(testDir, 'workflows', 'parallel-test.json'), workflow);

        // Mock process.cwd() or similar if possible, but easier to just use the testDir in Orchestrator if it supported it.
        // Since Orchestrator uses process.cwd() internally for .mehaisi, we might need a workaround or just use the real .mehaisi but carefully.
        // Actually, let's just use the current directory but create a temporary .mehaisi there for the test and clean it up.
    });

    afterAll(async () => {
        // await fs.remove(testDir);
    });

    beforeEach(async () => {
        // We'll use a real Orchestrator but mock its LLM providers
        orchestrator = new Orchestrator(mockConfig);

        // Mock the provider to avoid real API calls
        const mockProvider = {
            execute: jest.fn().mockResolvedValue({
                success: true,
                content: 'Mock result',
                raw: {}
            })
        };

        // Inject mock provider
        orchestrator.providerManager.providers.set('claude-code', mockProvider);
    });

    test('runs a parallel workflow step successfully', async () => {
        // Ensure the directory structure exists in process.cwd() for the duration of the test
        const originalMehaisi = path.join(process.cwd(), '.mehaisi');
        const tempMehaisi = path.join(process.cwd(), '.mehaisi-temp-integration');

        // Backup real .mehaisi if it exists
        let backupExists = false;
        if (await fs.pathExists(originalMehaisi)) {
            await fs.rename(originalMehaisi, tempMehaisi);
            backupExists = true;
        }

        try {
            // Setup test mehaisi
            await fs.ensureDir(originalMehaisi);
            await fs.ensureDir(path.join(originalMehaisi, 'agents'));
            await fs.ensureDir(path.join(originalMehaisi, 'workflows'));

            await fs.writeFile(path.join(originalMehaisi, 'agents', 'agent1.yml'), 'name: agent1\ninstructions: test');
            await fs.writeFile(path.join(originalMehaisi, 'agents', 'agent2.yml'), 'name: agent2\ninstructions: test');

            const workflow = {
                name: 'parallel-test',
                steps: [{ name: 'p1', type: 'parallel', agents: ['agent1', 'agent2'] }]
            };
            await fs.writeJSON(path.join(originalMehaisi, 'workflows', 'parallel-test.json'), workflow);

            // Run!
            const results = await orchestrator.runWorkflow('parallel-test');

            expect(results).toHaveLength(1);
            expect(results[0].step).toBe('p1');
            expect(results[0].results).toHaveLength(2);
            expect(results[0].results.every(r => r.value.success)).toBe(true);
        } finally {
            // Cleanup and restore
            await fs.remove(originalMehaisi);
            if (backupExists) {
                await fs.rename(tempMehaisi, originalMehaisi);
            }
        }
    }, 30000); // 30s timeout
});
