/**
 * LLM Provider Manager
 * 
 * Provides an abstraction layer over different LLM providers (Ollama Cloud, Local, APIs, Claude Code CLI).
 * Enables switching providers without modifying agent code.
 */

class LLMProvider {
    constructor(config) {
        this.config = config;
    }

    /**
     * Execute an LLM request with the given instructions
     * @param {string} instructions - The instructions/prompt for the LLM
     * @param {Object} options - Additional options like model, temperature, etc.
     * @returns {Promise<Object>} The LLM response
     */
    async execute(instructions, options = {}) {
        throw new Error('execute() must be implemented by provider subclass');
    }

    /**
     * Check if the provider is available and healthy
     * @returns {Promise<boolean>}
     */
    async healthCheck() {
        throw new Error('healthCheck() must be implemented by provider subclass');
    }

    /**
     * Get the capabilities of this provider
     * @returns {Object} Capability flags
     */
    getCapabilities() {
        return {
            streaming: false,
            maxContext: 0,
            parallel: false,
            supportedModels: []
        };
    }
}

/**
 * Provider Manager - manages multiple LLM providers
 */
class LLMProviderManager {
    constructor(config) {
        this.config = config;
        this.providers = new Map();
        this.defaultProvider = config.llm?.default_provider || 'ollama-cloud';
    }

    /**
     * Register a provider
     * @param {string} name - Provider name
     * @param {LLMProvider} provider - Provider instance
     */
    register(name, provider) {
        this.providers.set(name, provider);
    }

    /**
     * Get a provider by name
     * @param {string} name - Provider name
     * @returns {LLMProvider}
     */
    getProvider(name) {
        const provider = this.providers.get(name || this.defaultProvider);
        if (!provider) {
            throw new Error(`Provider not found: ${name || this.defaultProvider}`);
        }
        return provider;
    }

    /**
     * Execute using the specified or default provider
     * @param {string} instructions - Instructions for the LLM
     * @param {Object} options - Options including provider selection
     * @returns {Promise<Object>}
     */
    async execute(instructions, options = {}) {
        const providerName = options.provider || this.defaultProvider;
        const provider = this.getProvider(providerName);
        return provider.execute(instructions, options);
    }

    /**
     * Health check all registered providers
     * @returns {Promise<Object>} Status of each provider
     */
    async healthCheckAll() {
        const results = {};
        for (const [name, provider] of this.providers.entries()) {
            try {
                results[name] = await provider.healthCheck();
            } catch (error) {
                results[name] = false;
            }
        }
        return results;
    }

    /**
     * Get capabilities of all providers
     * @returns {Object} Capabilities by provider name
     */
    getAllCapabilities() {
        const capabilities = {};
        for (const [name, provider] of this.providers.entries()) {
            capabilities[name] = provider.getCapabilities();
        }
        return capabilities;
    }
}

module.exports = { LLMProvider, LLMProviderManager };
