/**
 * Ollama Local Provider
 * 
 * Provides access to locally-running Ollama models
 */

const { LLMProvider } = require('../llm-provider');
const fetch = require('node-fetch');

class OllamaLocalProvider extends LLMProvider {
    constructor(config) {
        super(config);
        this.url = config.url || 'http://localhost:11434';
        this.model = config.model || 'kimi-k2.5';
        this.priority = config.priority || 2;
        this.fallback = config.fallback || false;
    }

    async execute(instructions, options = {}) {
        const model = options.model || this.model;
        const url = `${this.url}/api/generate`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                prompt: instructions,
                stream: false,
                options: options.params || {}
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama Local error: ${response.status} ${response.statusText}`);
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
            const response = await fetch(`${this.url}/api/version`, {
                method: 'GET',
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
            maxContext: 256000,
            parallel: true,
            supportedModels: [] // Depends on what's installed locally
        };
    }
}

module.exports = OllamaLocalProvider;
