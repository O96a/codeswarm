const CoordinationHub = require('../../src/coordination-hub');
const RuVectorMemory = require('../../src/ruvector-memory');
const fs = require('fs-extra');
const path = require('path');

// Mock dependencies
jest.mock('fs-extra');
jest.mock('../../ruvector-memory');

describe('CoordinationHub', () => {
    let hub;
    let mockSessionDir;
    let mockVectorMemory;

    beforeEach(() => {
        jest.clearAllMocks();

        mockSessionDir = '/mock/session';

        // Mock fs-extra methods
        fs.ensureDir = jest.fn().mockResolvedValue(undefined);
        fs.writeJSON = jest.fn().mockResolvedValue(undefined);
        fs.readJSON = jest.fn().mockResolvedValue({});
        fs.pathExists = jest.fn().mockResolvedValue(false);

        // Create mock vector memory
        mockVectorMemory = {
            initialize: jest.fn().mockResolvedValue(undefined),
            isAvailable: jest.fn().mockReturnValue(true),
            embed: jest.fn().mockResolvedValue(new Array(384).fill(0.5)),
            store: jest.fn().mockResolvedValue(true),
            search: jest.fn().mockResolvedValue([]),
            getStats: jest.fn().mockReturnValue({ available: true })
        };

        // Mock RuVectorMemory constructor
        RuVectorMemory.mockImplementation(() => mockVectorMemory);

        hub = new CoordinationHub(mockSessionDir, {
            ollama_url: 'http://localhost:11434',
            embedding_model: 'nomic-embed-text'
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Constructor', () => {
        test('initializes with session directory', () => {
            expect(hub.sessionDir).toBe(mockSessionDir);
            expect(hub.coordinationDir).toBe(path.join(mockSessionDir, 'coordination'));
        });

        test('initializes shared memory structures', () => {
            expect(hub.sharedMemory).toBeDefined();
            expect(hub.sharedMemory.findings).toEqual([]);
            expect(hub.sharedMemory.issues).toEqual([]);
            expect(hub.sharedMemory.fixes).toEqual([]);
        });

        test('creates vector memory instance', () => {
            expect(RuVectorMemory).toHaveBeenCalledWith(
                expect.objectContaining({
                    dbPath: expect.stringContaining('vector-memory'),
                    ollama_url: 'http://localhost:11434',
                    embedding_model: 'nomic-embed-text'
                })
            );
        });

        test('initializes active agents map', () => {
            expect(hub.activeAgents).toBeInstanceOf(Map);
            expect(hub.activeAgents.size).toBe(0);
        });
    });

    describe('initialize()', () => {
        test('creates coordination directory', async () => {
            await hub.initialize();

            expect(fs.ensureDir).toHaveBeenCalledWith(hub.coordinationDir);
        });

        test('initializes vector memory', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            await hub.initialize();

            expect(mockVectorMemory.initialize).toHaveBeenCalled();
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Vector memory initialized')
            );

            consoleSpy.mockRestore();
        });

        test('handles vector memory initialization failure gracefully', async () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            mockVectorMemory.initialize.mockRejectedValueOnce(new Error('Init failed'));

            await hub.initialize();

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Vector memory initialization failed')
            );

            consoleSpy.mockRestore();
        });

        test('loads state from disk', async () => {
            await hub.initialize();

            // loadState() is called during initialize
            expect(fs.pathExists).toHaveBeenCalled();
        });
    });

    describe('registerAgent()', () => {
        test('registers agent with capabilities', async () => {
            const agentConfig = {
                name: 'TestAgent',
                type: 'security',
                coordination: {
                    capabilities: ['security-analysis', 'vulnerability-check']
                }
            };

            await hub.registerAgent('agent-123', agentConfig);

            expect(hub.activeAgents.has('agent-123')).toBe(true);
            const agent = hub.activeAgents.get('agent-123');
            expect(agent.name).toBe('TestAgent');
            expect(agent.capabilities).toEqual(['security-analysis', 'vulnerability-check']);
            expect(agent.status).toBe('active');
        });

        test('saves state after registration', async () => {
            const agentConfig = { name: 'TestAgent', type: 'test' };

            await hub.registerAgent('agent-1', agentConfig);

            expect(fs.writeJSON).toHaveBeenCalled();
        });
    });

    describe('unregisterAgent()', () => {
        test('marks agent as completed', async () => {
            const agentConfig = { name: 'TestAgent', type: 'test' };
            await hub.registerAgent('agent-1', agentConfig);

            await hub.unregisterAgent('agent-1');

            const agent = hub.activeAgents.get('agent-1');
            expect(agent.status).toBe('completed');
            expect(agent.endTime).toBeDefined();
        });

        test('saves state after unregistration', async () => {
            const agentConfig = { name: 'TestAgent', type: 'test' };
            await hub.registerAgent('agent-1', agentConfig);

            // Clear previous calls
            fs.writeJSON.mockClear();

            await hub.unregisterAgent('agent-1');

            expect(fs.writeJSON).toHaveBeenCalled();
        });
    });

    describe('shareFinding() with Vector Memory', () => {
        beforeEach(async () => {
            await hub.registerAgent('agent-1', { name: 'TestAgent', type: 'test' });
        });

        test('stores finding and generates embedding', async () => {
            const finding = {
                type: 'bug',
                description: 'Found a security vulnerability',
                severity: 'high'
            };

            const findingId = await hub.shareFinding('agent-1', finding);

            expect(hub.sharedMemory.findings).toHaveLength(1);
            expect(mockVectorMemory.embed).toHaveBeenCalledWith('Found a security vulnerability');
            expect(mockVectorMemory.store).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Array),
                expect.objectContaining({
                    type: 'finding',
                    agentId: 'agent-1'
                })
            );
        });

        test('stores finding with message when description not available', async () => {
            const finding = {
                type: 'info',
                message: 'Processing completed successfully'
            };

            await hub.shareFinding('agent-1', finding);

            expect(mockVectorMemory.embed).toHaveBeenCalledWith('Processing completed successfully');
        });

        test('stores finding with summary when neither description nor message available', async () => {
            const finding = {
                type: 'info',
                summary: 'Task completed'
            };

            await hub.shareFinding('agent-1', finding);

            expect(mockVectorMemory.embed).toHaveBeenCalledWith('Task completed');
        });

        test('gracefully handles vector memory unavailability', async () => {
            mockVectorMemory.isAvailable.mockReturnValue(false);

            const finding = {
                description: 'Test finding'
            };

            await hub.shareFinding('agent-1', finding);

            expect(hub.sharedMemory.findings).toHaveLength(1);
            expect(mockVectorMemory.embed).not.toHaveBeenCalled();
        });

        test('handles embedding errors gracefully', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            mockVectorMemory.embed.mockRejectedValueOnce(new Error('Embedding failed'));

            const finding = {
                description: 'Test finding'
            };

            await hub.shareFinding('agent-1', finding);

            expect(hub.sharedMemory.findings).toHaveLength(1);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Could not store finding embedding')
            );

            consoleSpy.mockRestore();
        });

        test('returns finding ID', async () => {
            const finding = { description: 'Test' };

            const id = await hub.shareFinding('agent-1', finding);

            expect(id).toBeDefined();
            expect(typeof id).toBe('string');
        });
    });

    describe('reportIssue() with Vector Memory', () => {
        beforeEach(async () => {
            await hub.registerAgent('agent-1', { name: 'TestAgent', type: 'test' });
        });

        test('stores issue and generates embedding', async () => {
            const issue = {
                title: 'Memory leak detected',
                description: 'Application consumes excessive memory over time',
                severity: 'high'
            };

            await hub.reportIssue('agent-1', issue);

            expect(hub.sharedMemory.issues).toHaveLength(1);
            expect(mockVectorMemory.embed).toHaveBeenCalledWith(
                'Memory leak detected Application consumes excessive memory over time'
            );
            expect(mockVectorMemory.store).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Array),
                expect.objectContaining({
                    type: 'issue',
                    agentId: 'agent-1'
                })
            );
        });

        test('handles missing description', async () => {
            const issue = {
                title: 'Bug found'
            };

            await hub.reportIssue('agent-1', issue);

            expect(mockVectorMemory.embed).toHaveBeenCalledWith('Bug found');
        });

        test('gracefully handles vector memory unavailability', async () => {
            mockVectorMemory.isAvailable.mockReturnValue(false);

            const issue = {
                title: 'Test issue',
                description: 'Description'
            };

            await hub.reportIssue('agent-1', issue);

            expect(hub.sharedMemory.issues).toHaveLength(1);
            expect(mockVectorMemory.embed).not.toHaveBeenCalled();
        });

        test('handles embedding errors gracefully', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            mockVectorMemory.embed.mockRejectedValueOnce(new Error('Embedding failed'));

            const issue = {
                title: 'Test issue',
                description: 'Description'
            };

            await hub.reportIssue('agent-1', issue);

            expect(hub.sharedMemory.issues).toHaveLength(1);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Could not store issue embedding')
            );

            consoleSpy.mockRestore();
        });

        test('sets issue status to open by default', async () => {
            const issue = { title: 'Test', description: 'Test' };

            await hub.reportIssue('agent-1', issue);

            expect(hub.sharedMemory.issues[0].status).toBe('open');
        });
    });

    describe('searchSimilarFindings()', () => {
        test('performs semantic search for similar findings', async () => {
            const mockResults = [
                {
                    id: 'finding-1',
                    score: 0.95,
                    metadata: {
                        type: 'finding',
                        finding: { id: 'finding-1', description: 'Similar finding' }
                    }
                },
                {
                    id: 'finding-2',
                    score: 0.85,
                    metadata: {
                        type: 'finding',
                        finding: { id: 'finding-2', description: 'Another finding' }
                    }
                }
            ];

            mockVectorMemory.search.mockResolvedValueOnce(mockResults);

            const results = await hub.searchSimilarFindings('security vulnerability', 5);

            expect(mockVectorMemory.embed).toHaveBeenCalledWith('security vulnerability');
            expect(mockVectorMemory.search).toHaveBeenCalledWith(expect.any(Array), 5);
            expect(results).toHaveLength(2);
            expect(results[0].id).toBe('finding-1');
            expect(results[0].score).toBe(0.95);
        });

        test('filters out non-finding results', async () => {
            const mockResults = [
                {
                    id: 'finding-1',
                    score: 0.95,
                    metadata: { type: 'finding', finding: { id: 'finding-1' } }
                },
                {
                    id: 'issue-1',
                    score: 0.90,
                    metadata: { type: 'issue', issue: { id: 'issue-1' } }
                }
            ];

            mockVectorMemory.search.mockResolvedValueOnce(mockResults);

            const results = await hub.searchSimilarFindings('test', 5);

            expect(results).toHaveLength(1);
            expect(results[0].id).toBe('finding-1');
        });

        test('returns empty array when vector memory unavailable', async () => {
            mockVectorMemory.isAvailable.mockReturnValue(false);

            const results = await hub.searchSimilarFindings('test', 5);

            expect(results).toEqual([]);
            expect(mockVectorMemory.embed).not.toHaveBeenCalled();
        });

        test('handles search errors gracefully', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            mockVectorMemory.search.mockRejectedValueOnce(new Error('Search failed'));

            const results = await hub.searchSimilarFindings('test', 5);

            expect(results).toEqual([]);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Semantic search failed')
            );

            consoleSpy.mockRestore();
        });
    });

    describe('searchSimilarIssues()', () => {
        test('performs semantic search for similar issues', async () => {
            const mockResults = [
                {
                    id: 'issue-1',
                    score: 0.92,
                    metadata: {
                        type: 'issue',
                        issue: { id: 'issue-1', title: 'Memory leak' }
                    }
                }
            ];

            mockVectorMemory.search.mockResolvedValueOnce(mockResults);

            const results = await hub.searchSimilarIssues('memory problem', 5);

            expect(mockVectorMemory.embed).toHaveBeenCalledWith('memory problem');
            expect(results).toHaveLength(1);
            expect(results[0].id).toBe('issue-1');
        });

        test('filters out non-issue results', async () => {
            const mockResults = [
                {
                    id: 'issue-1',
                    score: 0.92,
                    metadata: { type: 'issue', issue: { id: 'issue-1' } }
                },
                {
                    id: 'finding-1',
                    score: 0.88,
                    metadata: { type: 'finding', finding: { id: 'finding-1' } }
                }
            ];

            mockVectorMemory.search.mockResolvedValueOnce(mockResults);

            const results = await hub.searchSimilarIssues('test', 5);

            expect(results).toHaveLength(1);
            expect(results[0].id).toBe('issue-1');
        });

        test('returns empty array when vector memory unavailable', async () => {
            mockVectorMemory.isAvailable.mockReturnValue(false);

            const results = await hub.searchSimilarIssues('test', 5);

            expect(results).toEqual([]);
        });

        test('handles search errors gracefully', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            mockVectorMemory.search.mockRejectedValueOnce(new Error('Search failed'));

            const results = await hub.searchSimilarIssues('test', 5);

            expect(results).toEqual([]);
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });
    });

    describe('Existing Functionality (Regression Tests)', () => {
        beforeEach(async () => {
            await hub.registerAgent('agent-1', {
                name: 'TestAgent',
                type: 'security',
                coordination: {
                    capabilities: ['security-analysis']
                }
            });
        });

        test('queryFindings() filters findings correctly', async () => {
            hub.sharedMemory.findings = [
                { type: 'bug', severity: 'high', category: 'security' },
                { type: 'feature', severity: 'low', category: 'ui' },
                { type: 'bug', severity: 'medium', category: 'api' }
            ];

            const results = await hub.queryFindings('agent-1', { type: 'bug' });

            expect(results).toHaveLength(2);
            expect(results.every(r => r.type === 'bug')).toBe(true);
        });

        test('queryIssues() filters issues correctly', async () => {
            hub.sharedMemory.issues = [
                { status: 'open', severity: 'high' },
                { status: 'resolved', severity: 'low' },
                { status: 'open', severity: 'medium' }
            ];

            const results = await hub.queryIssues('agent-1', { status: 'open' });

            expect(results).toHaveLength(2);
            expect(results.every(r => r.status === 'open')).toBe(true);
        });

        test('getRecommendations() returns relevant items', async () => {
            hub.sharedMemory.issues = [
                { status: 'open', requiredCapability: 'security-analysis' }
            ];

            const recommendations = await hub.getRecommendations('agent-1');

            expect(recommendations.length).toBeGreaterThan(0);
            expect(recommendations[0].type).toBe('issue_resolution');
        });

        test('reportFix() updates related issue', async () => {
            const issueId = 'issue-123';
            hub.sharedMemory.issues = [
                { id: issueId, status: 'open', title: 'Test issue' }
            ];

            await hub.reportFix('agent-1', {
                issueId,
                description: 'Fixed the issue'
            });

            const issue = hub.sharedMemory.issues.find(i => i.id === issueId);
            expect(issue.status).toBe('resolved');
            expect(issue.resolvedBy).toBe('agent-1');
        });
    });

    describe('State Persistence', () => {
        test('saveState() writes to disk', async () => {
            hub.sharedMemory.findings = [{ id: '1', description: 'Test' }];

            await hub.saveState();

            expect(fs.writeJSON).toHaveBeenCalledWith(
                expect.stringContaining('state.json'),
                expect.objectContaining({
                    sharedMemory: hub.sharedMemory
                }),
                { spaces: 2 }
            );
        });

        test('loadState() restores from disk', async () => {
            const savedState = {
                sharedMemory: {
                    findings: [{ id: '1', description: 'Saved' }],
                    issues: [],
                    fixes: []
                },
                messageQueue: [],
                activeAgents: []
            };

            fs.pathExists.mockResolvedValueOnce(true);
            fs.readJSON.mockResolvedValueOnce(savedState);

            await hub.loadState();

            expect(hub.sharedMemory.findings).toEqual(savedState.sharedMemory.findings);
        });
    });

    describe('Integration Scenarios', () => {
        test('complete workflow: register, share finding, search similar', async () => {
            // Register agent
            await hub.registerAgent('agent-1', {
                name: 'SecurityAgent',
                type: 'security'
            });

            // Share finding with embedding
            const finding = {
                description: 'SQL injection vulnerability detected in login form'
            };

            const findingId = await hub.shareFinding('agent-1', finding);

            // Mock search results
            mockVectorMemory.search.mockResolvedValueOnce([
                {
                    id: findingId,
                    score: 0.99,
                    metadata: {
                        type: 'finding',
                        finding: hub.sharedMemory.findings[0]
                    }
                }
            ]);

            // Search for similar findings
            const similarFindings = await hub.searchSimilarFindings('SQL injection', 5);

            expect(similarFindings).toHaveLength(1);
            expect(similarFindings[0].finding.description).toContain('SQL injection');
        });

        test('graceful degradation without vector memory', async () => {
            // Simulate vector memory completely unavailable
            mockVectorMemory.isAvailable.mockReturnValue(false);
            mockVectorMemory.initialize.mockRejectedValueOnce(new Error('Init failed'));

            await hub.registerAgent('agent-1', { name: 'TestAgent', type: 'test' });

            // Should still work without vector memory
            const finding = { description: 'Test finding' };
            await hub.shareFinding('agent-1', finding);

            expect(hub.sharedMemory.findings).toHaveLength(1);

            // Search should return empty
            const results = await hub.searchSimilarFindings('test', 5);
            expect(results).toEqual([]);
        });
    });
});
