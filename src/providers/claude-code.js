/**
 * Claude Code CLI Provider
 * 
 * Executes agents using the Claude Code CLI, using Ollama Cloud as backend via env vars
 */

const { LLMProvider } = require('../llm-provider');
const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

class ClaudeCodeProvider extends LLMProvider {
    constructor(config) {
        super(config);
        this.ollamaUrl = config.ollama_url || 'https://api.ollama.com';
        this.model = config.model || 'kimi-k2.5:cloud';
        this.timeout = config.timeout || 600000; // 10 minutes default
    }

    async execute(instructions, options = {}) {
        const model = options.model || this.model;
        const timeout = options.timeout || this.timeout;
        const agentId = options.agentId || 'unknown';

        // Setup environment for Claude Code to use Ollama Cloud
        const env = {
            ...process.env,
            ANTHROPIC_AUTH_TOKEN: 'ollama',
            ANTHROPIC_BASE_URL: this.ollamaUrl,
            ANTHROPIC_API_KEY: '',
            CLAUDE_INSTANCE_ID: agentId
        };

        // Write instructions to temp file
        const tempDir = path.join(process.cwd(), '.mehaisi', 'temp');
        await fs.ensureDir(tempDir);
        const instructionsPath = path.join(tempDir, `${agentId}-instructions.md`);
        await fs.writeFile(instructionsPath, instructions);

        return new Promise((resolve, reject) => {
            let stdout = '';
            let stderr = '';
            let timeoutId;

            const child = spawn('claude', ['--model', model, '--file', instructionsPath], {
                env,
                cwd: options.workingDir || process.cwd(),
                stdio: ['pipe', 'pipe', 'pipe']
            });

            // Timeout handling
            timeoutId = setTimeout(() => {
                child.kill('SIGTERM');
                reject(new Error(`Claude Code execution timed out after ${timeout}ms`));
            }, timeout);

            // Capture output
            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            // Handle completion
            child.on('close', async (code) => {
                clearTimeout(timeoutId);

                // Cleanup temp file
                await fs.remove(instructionsPath).catch(() => { });

                if (code === 0) {
                    resolve({
                        success: true,
                        output: stdout,
                        stderr,
                        exitCode: code,
                        agentId
                    });
                } else {
                    reject(new Error(`Claude Code exited with code ${code}\\nStderr: ${stderr}`));
                }
            });

            child.on('error', (error) => {
                clearTimeout(timeoutId);
                reject(new Error(`Failed to spawn Claude Code: ${error.message}`));
            });
        });
    }

    async healthCheck() {
        return new Promise((resolve) => {
            const child = spawn('claude', ['--version'], {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            child.on('close', (code) => {
                resolve(code === 0);
            });

            child.on('error', () => {
                resolve(false);
            });

            setTimeout(() => {
                child.kill();
                resolve(false);
            }, 5000);
        });
    }

    getCapabilities() {
        return {
            streaming: false,
            maxContext: 256000, // Kimi 2.5 via Ollama Cloud
            parallel: true, // Managed by ParallelExecutor
            supportedModels: ['kimi-k2.5:cloud', 'qwen3-coder', 'glm-4.7', 'gpt-oss:20b']
        };
    }
}

module.exports = ClaudeCodeProvider;
