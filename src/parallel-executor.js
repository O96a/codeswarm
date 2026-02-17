/**
 * Parallel Executor
 * 
 * Manages parallel execution of agents via AgentRunner with hard resource limits
 */

const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const yaml = require('yaml');

// HARD LIMITS - Cannot be overridden by config
const HARD_LIMITS = {
    MAX_PARALLEL: 3,              // Never more than 3 Claude instances
    INSTANCE_TIMEOUT_MS: 600000,  // 10 minutes per agent
    MAX_QUEUE_DEPTH: 10,          // Don't queue more than 10
    BATCH_COOLDOWN_MS: 2000,      // 2 sec between batches
    MAX_RETRIES: 2,               // Max 2 retries per agent
    SESSION_TIMEOUT_MS: 3600000,  // 1 hour max session
};

class ParallelExecutor {
    constructor(agentRunner, config = {}) {
        this.agentRunner = agentRunner;
        this.config = config;
        this.maxParallel = Math.min(
            config.parallel_agents || HARD_LIMITS.MAX_PARALLEL,
            HARD_LIMITS.MAX_PARALLEL
        );
        this.activeProcesses = new Map();
        this.queue = [];
        this.sessionStartTime = null;
    }

    /**
     * Execute multiple agents in parallel with hard limits
     * @param {Array} agents - List of { agentName, options } objects
     * @returns {Promise<Array>} Results for each agent
     */
    async executeParallel(agents) {
        if (!this.sessionStartTime) {
            this.sessionStartTime = Date.now();
        }

        // Enforce session timeout
        const sessionDuration = Date.now() - this.sessionStartTime;
        if (sessionDuration > HARD_LIMITS.SESSION_TIMEOUT_MS) {
            throw new Error(`Session timeout: exceeded ${HARD_LIMITS.SESSION_TIMEOUT_MS / 1000}s limit`);
        }

        // Enforce queue depth
        if (agents.length > HARD_LIMITS.MAX_QUEUE_DEPTH) {
            console.log(chalk.yellow(`⚠ Queue depth ${agents.length} exceeds limit ${HARD_LIMITS.MAX_QUEUE_DEPTH}`));
            agents = agents.slice(0, HARD_LIMITS.MAX_QUEUE_DEPTH);
        }

        // Split into batches
        const batches = this.createBatches(agents, this.maxParallel);
        const results = [];

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            console.log(chalk.blue(`→ Executing batch ${i + 1}/${batches.length} (${batch.length} agents in parallel)`));

            // Run batch
            const batchResults = await Promise.allSettled(
                batch.map(agent => this.executeWithRetry(agent))
            );

            results.push(...batchResults);

            // Cooldown between batches (except last batch)
            if (i < batches.length - 1) {
                console.log(chalk.gray(`⏱ Cooling down for ${HARD_LIMITS.BATCH_COOLDOWN_MS}ms...`));
                await this.sleep(HARD_LIMITS.BATCH_COOLDOWN_MS);
            }
        }

        return results;
    }

    /**
     * Load agent configuration from .mehaisi/agents directory
     */
    async loadAgentConfig(agentName) {
        const agentPath = path.join(process.cwd(), '.mehaisi', 'agents', `${agentName}.yml`);

        if (!await fs.pathExists(agentPath)) {
            throw new Error(`Agent not found: ${agentName}`);
        }

        const content = await fs.readFile(agentPath, 'utf8');
        return yaml.parse(content);
    }

    /**
     * Execute a single agent with retry logic
     * @param {Object} agent - Agent configuration { agentName, options }
     * @returns {Promise<Object>}
     */
    async executeWithRetry(agent) {
        let lastError;
        let attempts = 0;
        const agentId = `${agent.agentName}-${Date.now()}`;

        while (attempts <= HARD_LIMITS.MAX_RETRIES) {
            try {
                // Mark as active
                this.activeProcesses.set(agentId, { startTime: Date.now(), attempts });

                // Load agent configuration
                const agentConfig = await this.loadAgentConfig(agent.agentName);

                // Execute with enforced timeout
                const options = {
                    ...agent.options,
                    agentId,
                    timeout: Math.min(
                        agent.options?.timeout || HARD_LIMITS.INSTANCE_TIMEOUT_MS,
                        HARD_LIMITS.INSTANCE_TIMEOUT_MS
                    )
                };

                const result = await this.agentRunner.execute(agent.agentName, agentConfig, options);

                // Cleanup
                this.activeProcesses.delete(agentId);

                return {
                    agentName: agent.agentName,
                    id: agentId,
                    success: true,
                    result,
                    attempts: attempts + 1
                };
            } catch (error) {
                lastError = error;
                attempts++;
                this.activeProcesses.delete(agentId);

                if (attempts <= HARD_LIMITS.MAX_RETRIES) {
                    console.log(chalk.yellow(`⚠ Agent ${agent.agentName} failed (attempt ${attempts}), retrying...`));
                    await this.sleep(1000 * attempts); // Exponential backoff
                }
            }
        }

        // All retries exhausted
        return {
            agentName: agent.agentName,
            id: agentId,
            success: false,
            error: lastError.message,
            attempts
        };
    }

    /**
     * Create batches of agents for parallel execution
     * @param {Array} agents - Full list of agents
     * @param {number} batchSize - Max agents per batch
     * @returns {Array<Array>} Batches
     */
    createBatches(agents, batchSize) {
        const batches = [];
        for (let i = 0; i < agents.length; i += batchSize) {
            batches.push(agents.slice(i, i + batchSize));
        }
        return batches;
    }

    /**
     * Sleep for specified milliseconds
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get current execution stats
     * @returns {Object}
     */
    getStats() {
        return {
            activeProcesses: this.activeProcesses.size,
            maxParallel: this.maxParallel,
            sessionDuration: this.sessionStartTime ? Date.now() - this.sessionStartTime : 0,
            limits: HARD_LIMITS
        };
    }

    /**
     * Reset the executor (e.g., for new session)
     */
    reset() {
        this.activeProcesses.clear();
        this.queue = [];
        this.sessionStartTime = null;
    }
}

module.exports = { ParallelExecutor, HARD_LIMITS };
