const RuVectorMemory = require('../../src/ruvector-memory');
const fs = require('fs-extra');
const path = require('path');

// Mock ruvector module
jest.mock('ruvector', () => ({
    VectorDB: jest.fn().mockImplementation(() => ({
        insert: jest.fn().mockResolvedValue(undefined),
        search: jest.fn().mockResolvedValue([]),
    }))
}), { virtual: true });

// Mock fs-extra
jest.mock('fs-extra');

// Mock fetch globally
global.fetch = jest.fn();

describe('RuVectorMemory', () => {
    let memory;
    let mockVectorDB;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Setup fs-extra mocks
        fs.ensureDir = jest.fn().mockResolvedValue(undefined);

        // Get the mocked VectorDB class
        const { VectorDB } = require('ruvector');
        mockVectorDB = new VectorDB();

        memory = new RuVectorMemory({
            dimSize: 384,
            ollama_url: 'http://localhost:11434',
            embedding_model: 'nomic-embed-text'
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Constructor', () => {
        test('initializes with default config', () => {
            const defaultMemory = new RuVectorMemory();

            expect(defaultMemory.dimSize).toBe(384);
            expect(defaultMemory.embeddingModel).toBe('nomic-embed-text');
            expect(defaultMemory.db).toBeNull();
            expect(defaultMemory.initialized).toBe(false);
            expect(defaultMemory.ollamaAvailable).toBeNull();
        });

        test('initializes with custom config', () => {
            const customMemory = new RuVectorMemory({
                dimSize: 768,
                dbPath: '/custom/path',
                ollama_url: 'http://custom:11434',
                embedding_model: 'custom-model'
            });

            expect(customMemory.dimSize).toBe(768);
            expect(customMemory.dbPath).toBe('/custom/path');
            expect(customMemory.ollamaUrl).toBe('http://custom:11434');
            expect(customMemory.embeddingModel).toBe('custom-model');
        });

        test('sets default db path when not provided', () => {
            const defaultMemory = new RuVectorMemory();

            expect(defaultMemory.dbPath).toContain('.mehaisi');
            expect(defaultMemory.dbPath).toContain('vector-memory');
        });
    });

    describe('initialize()', () => {
        test('initializes successfully with ruvector', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            await memory.initialize();

            expect(memory.initialized).toBe(true);
            expect(memory.db).toBeDefined();
            expect(fs.ensureDir).toHaveBeenCalledWith(memory.dbPath);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('RuVector memory initialized')
            );

            consoleSpy.mockRestore();
        });

        test('skips initialization if already initialized', async () => {
            await memory.initialize();
            const firstDb = memory.db;

            await memory.initialize();

            expect(memory.db).toBe(firstDb);
        });

        test('handles initialization failure gracefully', async () => {
            const errorMemory = new RuVectorMemory();
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            // Force import to fail
            const { VectorDB } = require('ruvector');
            VectorDB.mockImplementationOnce(() => {
                throw new Error('Import failed');
            });

            await errorMemory.initialize();

            expect(errorMemory.initialized).toBe(false);
            expect(errorMemory.db).toBeNull();
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });

        test('creates VectorDB with correct dimensions', async () => {
            const { VectorDB } = require('ruvector');

            await memory.initialize();

            expect(VectorDB).toHaveBeenCalledWith({
                dimensions: 384,
                metric: 'cosine'
            });
        });
    });

    describe('store()', () => {
        beforeEach(async () => {
            await memory.initialize();
        });

        test('stores finding with embedding and metadata', async () => {
            const id = 'finding-123';
            const embedding = new Array(384).fill(0.5);
            const metadata = { type: 'bug', severity: 'high' };

            const result = await memory.store(id, embedding, metadata);

            expect(result).toBe(true);
            expect(memory.db.insert).toHaveBeenCalledWith(id, embedding, metadata);
        });

        test('initializes if not already initialized', async () => {
            const uninitMemory = new RuVectorMemory();
            const embedding = new Array(384).fill(0.5);

            await uninitMemory.store('test', embedding, {});

            expect(uninitMemory.initialized).toBe(true);
        });

        test('returns false when DB unavailable', async () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            memory.db = null;

            const result = await memory.store('test', [], {});

            expect(result).toBe(false);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Vector memory not available')
            );

            consoleSpy.mockRestore();
        });

        test('handles storage errors gracefully', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            memory.db.insert.mockRejectedValueOnce(new Error('Storage failed'));

            const result = await memory.store('test', [0.5], {});

            expect(result).toBe(false);
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });
    });

    describe('search()', () => {
        beforeEach(async () => {
            await memory.initialize();
        });

        test('searches for similar findings', async () => {
            const queryEmbedding = new Array(384).fill(0.3);
            const mockResults = [
                { id: 'finding1', score: 0.95, metadata: { type: 'bug' } },
                { id: 'finding2', score: 0.85, metadata: { type: 'feature' } }
            ];

            memory.db.search.mockResolvedValueOnce(mockResults);

            const results = await memory.search(queryEmbedding, 5);

            expect(memory.db.search).toHaveBeenCalledWith(queryEmbedding, { k: 5 });
            expect(results).toHaveLength(2);
            expect(results[0].id).toBe('finding1');
            expect(results[0].score).toBe(0.95);
        });

        test('uses default k value when not specified', async () => {
            const queryEmbedding = new Array(384).fill(0.3);
            memory.db.search.mockResolvedValueOnce([]);

            await memory.search(queryEmbedding);

            expect(memory.db.search).toHaveBeenCalledWith(queryEmbedding, { k: 5 });
        });

        test('returns empty array when DB unavailable', async () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            memory.db = null;

            const results = await memory.search([0.5], 5);

            expect(results).toEqual([]);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Vector memory not available')
            );

            consoleSpy.mockRestore();
        });

        test('handles search errors gracefully', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            memory.db.search.mockRejectedValueOnce(new Error('Search failed'));

            const results = await memory.search([0.5], 5);

            expect(results).toEqual([]);
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });
    });

    describe('embed()', () => {
        test('uses Ollama API when available', async () => {
            const mockEmbedding = new Array(384).fill(0.7);
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ embedding: mockEmbedding })
            });

            const result = await memory.embed('test text');

            expect(result).toEqual(mockEmbedding);
            expect(memory.ollamaAvailable).toBe(true);
            expect(global.fetch).toHaveBeenCalledWith(
                'http://localhost:11434/api/embeddings',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                })
            );
        });

        test('falls back to placeholder when Ollama unavailable', async () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            global.fetch.mockRejectedValueOnce(new Error('Connection failed'));

            const result = await memory.embed('test text');

            expect(result).toHaveLength(384);
            expect(memory.ollamaAvailable).toBe(false);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Ollama embeddings API unavailable')
            );

            consoleSpy.mockRestore();
        });

        test('uses placeholder immediately after first Ollama failure', async () => {
            // First call fails
            global.fetch.mockRejectedValueOnce(new Error('Connection failed'));
            await memory.embed('first text');

            // Second call should use placeholder without trying Ollama
            const result = await memory.embed('second text');

            expect(result).toHaveLength(384);
            expect(global.fetch).toHaveBeenCalledTimes(1); // Only called once
        });

        test('sends correct request body to Ollama', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ embedding: new Array(384).fill(0.5) })
            });

            await memory.embed('test text');

            const fetchCall = global.fetch.mock.calls[0];
            const requestBody = JSON.parse(fetchCall[1].body);

            expect(requestBody).toEqual({
                model: 'nomic-embed-text',
                prompt: 'test text'
            });
        });
    });

    describe('embedWithOllama()', () => {
        test('generates embedding from Ollama API', async () => {
            const mockEmbedding = new Array(384).fill(0.6);
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ embedding: mockEmbedding })
            });

            const result = await memory.embedWithOllama('test text');

            expect(result).toEqual(mockEmbedding);
        });

        test('throws error on API failure', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            });

            await expect(memory.embedWithOllama('test'))
                .rejects.toThrow('Ollama API returned 500');
        });

        test('throws error on invalid response', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ invalid: 'response' })
            });

            await expect(memory.embedWithOllama('test'))
                .rejects.toThrow('Invalid embedding response');
        });

        test('adjusts dimSize when embedding dimension differs', async () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            const differentSizeEmbedding = new Array(512).fill(0.5);

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ embedding: differentSizeEmbedding })
            });

            await memory.embedWithOllama('test');

            expect(memory.dimSize).toBe(512);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Embedding dimension mismatch')
            );

            consoleSpy.mockRestore();
        });

        test('includes timeout in request', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ embedding: new Array(384).fill(0.5) })
            });

            await memory.embedWithOllama('test');

            const fetchCall = global.fetch.mock.calls[0];
            expect(fetchCall[1].signal).toBeDefined();
        });
    });

    describe('embedWithPlaceholder()', () => {
        test('generates consistent embedding for same text', () => {
            const embedding1 = memory.embedWithPlaceholder('test text');
            const embedding2 = memory.embedWithPlaceholder('test text');

            expect(embedding1).toEqual(embedding2);
        });

        test('generates different embeddings for different text', () => {
            const embedding1 = memory.embedWithPlaceholder('text one');
            const embedding2 = memory.embedWithPlaceholder('text two');

            expect(embedding1).not.toEqual(embedding2);
        });

        test('generates embedding with correct dimensions', () => {
            const embedding = memory.embedWithPlaceholder('test');

            expect(embedding).toHaveLength(384);
        });

        test('generates normalized values (0 to 1)', () => {
            const embedding = memory.embedWithPlaceholder('test');

            embedding.forEach(value => {
                expect(value).toBeGreaterThanOrEqual(0);
                expect(value).toBeLessThanOrEqual(1);
            });
        });
    });

    describe('simpleHash()', () => {
        test('generates consistent hash for same string', () => {
            const hash1 = memory.simpleHash('test string');
            const hash2 = memory.simpleHash('test string');

            expect(hash1).toBe(hash2);
        });

        test('generates different hashes for different strings', () => {
            const hash1 = memory.simpleHash('string one');
            const hash2 = memory.simpleHash('string two');

            expect(hash1).not.toBe(hash2);
        });

        test('returns positive number', () => {
            const hash = memory.simpleHash('test');

            expect(hash).toBeGreaterThanOrEqual(0);
        });
    });

    describe('isAvailable()', () => {
        test('returns false when not initialized', () => {
            const uninitMemory = new RuVectorMemory();

            expect(uninitMemory.isAvailable()).toBe(false);
        });

        test('returns true when initialized with DB', async () => {
            await memory.initialize();

            expect(memory.isAvailable()).toBe(true);
        });

        test('returns false when initialized but DB is null', async () => {
            await memory.initialize();
            memory.db = null;

            expect(memory.isAvailable()).toBe(false);
        });
    });

    describe('getStats()', () => {
        test('returns unavailable when not initialized', () => {
            const uninitMemory = new RuVectorMemory();
            const stats = uninitMemory.getStats();

            expect(stats.available).toBe(false);
        });

        test('returns full stats when initialized', async () => {
            await memory.initialize();
            memory.ollamaAvailable = true;

            const stats = memory.getStats();

            expect(stats.available).toBe(true);
            expect(stats.dimSize).toBe(384);
            expect(stats.dbPath).toBeDefined();
            expect(stats.ollamaUrl).toBe('http://localhost:11434');
            expect(stats.embeddingModel).toBe('nomic-embed-text');
            expect(stats.ollamaAvailable).toBe(true);
        });

        test('includes Ollama availability status', async () => {
            await memory.initialize();
            memory.ollamaAvailable = false;

            const stats = memory.getStats();

            expect(stats.ollamaAvailable).toBe(false);
        });
    });

    describe('clear()', () => {
        test('clears and reinitializes database', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            await memory.initialize();

            await memory.clear();

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Clear operation not supported')
            );
            expect(memory.initialized).toBe(true);
            expect(memory.db).toBeDefined();

            consoleSpy.mockRestore();
        });

        test('handles null DB gracefully', async () => {
            memory.db = null;

            await expect(memory.clear()).resolves.not.toThrow();
        });
    });

    describe('Integration Scenarios', () => {
        test('complete workflow: initialize, embed, store, search', async () => {
            // Initialize
            await memory.initialize();

            // Mock Ollama for embedding
            const mockEmbedding = new Array(384).fill(0.8);
            global.fetch.mockResolvedValue({
                ok: true,
                json: async () => ({ embedding: mockEmbedding })
            });

            // Embed text
            const embedding = await memory.embed('test finding');

            // Store
            const stored = await memory.store('finding-1', embedding, { type: 'test' });
            expect(stored).toBe(true);

            // Search
            memory.db.search.mockResolvedValueOnce([
                { id: 'finding-1', score: 0.99, metadata: { type: 'test' } }
            ]);
            const results = await memory.search(embedding, 5);

            expect(results).toHaveLength(1);
            expect(results[0].id).toBe('finding-1');
        });

        test('graceful degradation without Ollama', async () => {
            await memory.initialize();

            // Simulate Ollama unavailable
            global.fetch.mockRejectedValue(new Error('Connection failed'));

            // Should still work with placeholder embeddings
            const embedding = await memory.embed('test text');
            const stored = await memory.store('test-1', embedding, {});

            expect(embedding).toHaveLength(384);
            expect(stored).toBe(true);
            expect(memory.ollamaAvailable).toBe(false);
        });
    });
});
