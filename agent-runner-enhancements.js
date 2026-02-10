/**
 * ADDITIONAL methods to add to agent-runner.js
 * These should be added after line 101 (after the execute method closes)
 */

/**
 * Execute agent with timeout protection
 */
async executeWithTimeout(agentConfig, instructionsPath, agentId, timeout) {
    return new Promise((resolve, reject) => {
        const command = process.env.CLAUDE_CODE_OLLAMA_MODEL
            ? 'claude'
            : 'claude';

        const args = [];
        if (!process.env.CLAUDE_CODE_OLLAMA_MODEL) {
            args.push('--model', agentConfig.model || this.config.model);
        }

        const childProcess = spawn(command, args, {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        this.runningProcesses.set(agentId, childProcess);

        let stdout = '';
        let stderr = '';
        let timedOut = false;

        // Set timeout
        const timeoutId = setTimeout(() => {
            timedOut = true;
            childProcess.kill('SIGTERM');
            reject(new Error(`Agent execution timed out after ${timeout}ms`));
        }, timeout);

        // Capture output
        childProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        childProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        // Handle process completion
        childProcess.on('close', (code) => {
            clearTimeout(timeoutId);

            if (timedOut) return;

            if (code !== 0) {
                reject(new Error(`Agent exited with code ${code}. stderr: ${stderr}`));
            } else {
                resolve(stdout);
            }
        });

        childProcess.on('error', (error) => {
            clearTimeout(timeoutId);
            if (!timedOut) {
                reject(new Error(`Failed to start agent: ${error.message}`));
            }
        });

        // Pipe instructions to stdin
        fs.readFile(instructionsPath, 'utf8').then(instructions => {
            childProcess.stdin.write(instructions);
            childProcess.stdin.end();
        }).catch(err => {
            clearTimeout(timeoutId);
            childProcess.kill();
            reject(new Error(`Failed to read instructions: ${err.message}`));
        });
    });
}
