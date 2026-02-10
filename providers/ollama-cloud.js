/**
 * Ollama Cloud Provider
 * 
 * Provides access to Ollama Cloud models (default: Kimi 2.5)
 */

const { LLMProvider } = require('../llm-provider');
const fetch = require('node-fetch');

class OllamaCloudProvider extends LLMProvider {
    constructor(config) {
        super(config);
        this.url = config.url || 'https://api.ollama.com';
        this.model = config.model || 'kimi-k2.5:cloud';
        this.priority = config.priority || 1;
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
            throw new Error(`Ollama Cloud error: ${response.status} ${response.statusText}`);
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
            maxContext: 256000, // Kimi 2.5 has 256K context
            parallel: true,
            supportedModels: ['kimi-k2.5:cloud', 'qwen3-coder', 'glm-4.7', 'gpt-oss:20b']
        };
    }
}

module.exports = OllamaCloudProvider;
