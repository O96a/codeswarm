/**
 * RuVector Memory Wrapper
 * 
 * Provides vector memory capabilities for the Coordination Hub
 * Enables semantic search of past findings and agent results
 */

const fs = require('fs-extra');
const path = require('path');

class RuVectorMemory {
    constructor(config = {}) {
        this.config = config;
        this.dimSize = config.dimSize || 384; // Default embedding dimension
        this.dbPath = config.dbPath || path.join(process.cwd(), '.mehaisi', 'vector-memory');
        this.ollamaUrl = config.ollama_url || 'http://localhost:11434';
        this.embeddingModel = config.embedding_model || 'nomic-embed-text';
        this.db = null;
        this.initialized = false;
        this.ollamaAvailable = null; // null=unknown, true/false=tested
    }

    /**
     * Initialize the vector database
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // Dynamically import ruvector (ES module)
            const { VectorDB } = await import('ruvector');

            // Ensure storage directory exists
            await fs.ensureDir(this.dbPath);

            // Initialize vector database
            this.db = new VectorDB({
                dimensions: this.dimSize,
                metric: 'cosine' // Use cosine similarity for semantic search
            });

            this.initialized = true;
            console.log(`✓ RuVector memory initialized (${this.dimSize} dimensions)`);
        } catch (error) {
            console.error('Failed to initialize RuVector:', error.message);
            // Fallback: disable vector memory if ruvector not available
            this.initialized = false;
        }
    }

    /**
     * Store a finding with its embedding
     * @param {string} id - Unique identifier for the finding
     * @param {Array<number>} embedding - Vector embedding
     * @param {Object} metadata - Finding metadata
     */
    async store(id, embedding, metadata = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.db) {
            console.warn('⚠ Vector memory not available, skipping storage');
            return false;
        }

        try {
            await this.db.insert(id, embedding, metadata);
            return true;
        } catch (error) {
            console.error(`Failed to store finding ${id}:`, error.message);
            return false;
        }
    }

    /**
     * Search for similar findings
     * @param {Array<number>} queryEmbedding - Query vector
     * @param {number} k - Number of results to return
     * @returns {Promise<Array>} Similar findings with metadata
     */
    async search(queryEmbedding, k = 5) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.db) {
            console.warn('⚠ Vector memory not available, returning empty results');
            return [];
        }

        try {
            const results = await this.db.search(queryEmbedding, { k });
            return results.map(result => ({
                id: result.id,
                score: result.score,
                metadata: result.metadata
            }));
        } catch (error) {
            console.error('Failed to search vector memory:', error.message);
            return [];
        }
    }

    /**
     * Generate embedding from text using Ollama embeddings API
     * Falls back to hash-based placeholder if Ollama is unavailable
     * @param {string} text - Text to embed
     * @returns {Array<number>} Embedding vector
     */
    async embed(text) {
        // Try Ollama API if not explicitly disabled
        if (this.ollamaAvailable !== false) {
            try {
                const embedding = await this.embedWithOllama(text);
                this.ollamaAvailable = true; // Mark as available
                return embedding;
            } catch (error) {
                // First failure: log warning and mark as unavailable
                if (this.ollamaAvailable === null) {
                    console.warn(`⚠ Ollama embeddings API unavailable (${this.ollamaUrl}), falling back to placeholder`);
                    console.warn(`  Error: ${error.message}`);
                    this.ollamaAvailable = false;
                }
                // Fall through to placeholder
            }
        }

        // Fallback: Simple hash-based embedding
        return this.embedWithPlaceholder(text);
    }

    /**
     * Generate embedding using Ollama API
     * @private
     * @param {string} text - Text to embed
     * @returns {Promise<Array<number>>} Embedding vector
     */
    async embedWithOllama(text) {
        const response = await fetch(`${this.ollamaUrl}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.embeddingModel,
                prompt: text
            }),
            signal: AbortSignal.timeout(30000) // 30 second timeout
        });

        if (!response.ok) {
            throw new Error(`Ollama API returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.embedding || !Array.isArray(data.embedding)) {
            throw new Error('Invalid embedding response from Ollama');
        }

        // Verify dimension matches expected size
        if (data.embedding.length !== this.dimSize) {
            console.warn(`⚠ Embedding dimension mismatch: got ${data.embedding.length}, expected ${this.dimSize}`);
            // Adjust dimSize to match actual model output
            this.dimSize = data.embedding.length;
        }

        return data.embedding;
    }

    /**
     * Generate placeholder embedding (hash-based)
     * @private
     * @param {string} text - Text to embed
     * @returns {Array<number>} Embedding vector
     */
    embedWithPlaceholder(text) {
        const hash = this.simpleHash(text);
        const embedding = new Array(this.dimSize).fill(0);

        for (let i = 0; i < this.dimSize; i++) {
            embedding[i] = Math.sin(hash + i) * 0.5 + 0.5;
        }

        return embedding;
    }

    /**
     * Simple hash function for text
     * @private
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Check if vector memory is available
     */
    isAvailable() {
        return this.initialized && this.db !== null;
    }

    /**
     * Get stats about the vector memory
     */
    getStats() {
        if (!this.initialized || !this.db) {
            return { available: false };
        }

        return {
            available: true,
            dimSize: this.dimSize,
            dbPath: this.dbPath,
            ollamaUrl: this.ollamaUrl,
            embeddingModel: this.embeddingModel,
            ollamaAvailable: this.ollamaAvailable
        };
    }

    /**
     * Clear all stored vectors
     */
    async clear() {
        if (this.db) {
            // Note: ruvector may not have a clear() method
            // This would need to be implemented based on the actual API
            console.log('⚠ Clear operation not supported, recreating DB');
            this.db = null;
            this.initialized = false;
            await this.initialize();
        }
    }
}

module.exports = RuVectorMemory;
