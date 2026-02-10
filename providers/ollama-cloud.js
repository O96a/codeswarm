/**
 * Ollama Cloud Provider
 * 
 * Provides access to Ollama Cloud models (default: Kimi 2.5)
 */

const { LLMProvider } = require('../llm-provider');
const fetch = require('node-fetch');

class OllamaCloudProvider extends LLMProvider {
    constructor(config, credentialManager = null) {
        super(config);
        this.url = config.url || 'https://api.ollama.com';
        this.model = config.model || 'kimi-k2.5:cloud';
        this.priority = config.priority || 1;
        this.credentialManager = credentialManager;
        // Support API key from config or environment
        this.apiKey = config.api_key || process.env.OLLAMA_CLOUD_API_KEY || process.env.OLLAMA_API_KEY;
    }

    /**
     * Ensure API key is available, prompting user if necessary
     */
    async ensureApiKey() {
        if (this.apiKey) return this.apiKey;

        if (this.credentialManager) {
            // Use credential manager to get API key interactively
            this.apiKey = await this.credentialManager.getOllamaCloudKey(this.config);
        } else {
            // Fallback: check environment one more time
            this.apiKey = process.env.OLLAMA_CLOUD_API_KEY || process.env.OLLAMA_API_KEY;
        }

        if (!this.apiKey) {
            throw new Error('Ollama Cloud API key required. Set OLLAMA_CLOUD_API_KEY environment variable.');
        }

        return this.apiKey;
    }

    async execute(instructions, options = {}) {
        // Ensure we have an API key before making the request
        const apiKey = await this.ensureApiKey();

        const model = options.model || this.model;
        const url = `${this.url}/api/generate`;

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        };

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model,
                prompt: instructions,
                stream: false,
                options: options.params || {}
            })
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => response.statusText);
            if (response.status === 401) {
                throw new Error(`Ollama Cloud authentication failed. Set OLLAMA_CLOUD_API_KEY environment variable or add api_key to config.`);
            }
            throw new Error(`Ollama Cloud error: ${response.status} ${response.statusText}\n${errorText}`);
        }

        const data = await response.json();
        return {
            response: data.response,
            model: data.model,
            done: data.done,
            context: data.context
        };
    }

    async healthCheck() {
        try {
            const apiKey = await this.ensureApiKey();
            const headers = {
                'Authorization': `Bearer ${apiKey}`
            };
            
            const response = await fetch(`${this.url}/api/version`, {
                method: 'GET',
                headers,
                timeout: 5000
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    getCapabilities() {
        return {
            streaming: true,
            maxContext: 256000, // Kimi 2.5 has 256K context
            parallel: true,
            supportedModels: ['kimi-k2.5:cloud', 'qwen3-coder', 'glm-4.7', 'gpt-oss:20b']
        };
    }
}

module.exports = OllamaCloudProvider;
