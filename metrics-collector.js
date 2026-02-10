const fs = require('fs-extra');
const path = require('path');

/**
 * Metrics Collector - Track and analyze execution metrics for CodeSwarm sessions
 * Implements the missing statistics tracking (orchestrator.js TODOs)
 */
class MetricsCollector {
    constructor(sessionDir) {
        this.sessionDir = sessionDir;
        this.metrics = {
            session: {
                startTime: null,
                endTime: null,
                duration: 0
            },
            agents: {
                totalExecuted: 0,
                successful: 0,
                failed: 0,
                byName: {}
            },
            tests: {
                totalRuns: 0,
                passed: 0,
                failed: 0,
                skipped: 0
            },
            issues: {
                found: 0,
                resolved: 0,
                open: 0,
                bySeverity: {
                    critical: 0,
                    high: 0,
                    medium: 0,
                    low: 0
                },
                byType: {}
            },
            files: {
                modified: 0,
                created: 0,
                deleted: 0,
                analyzed: 0
            },
            coordination: {
                findingsShared: 0,
                issuesReported: 0,
                fixesReported: 0,
                helpRequests: 0,
                agentInteractions: 0
            },
            performance: {
                totalTokens: 0,
                averageAgentDuration: 0,
                longestAgent: { name: '', duration: 0 },
                shortestAgent: { name: '', duration: 0 }
            }
        };
    }

    /**
     * Initialize metrics for a new session
     */
    startSession() {
        this.metrics.session.startTime = Date.now();
    }

    /**
     * Finalize session metrics
     */
    endSession() {
        this.metrics.session.endTime = Date.now();
        this.metrics.session.duration = this.metrics.session.endTime - this.metrics.session.startTime;

        // Calculate average agent duration
        if (this.metrics.agents.totalExecuted > 0) {
            const totalDuration = Object.values(this.metrics.agents.byName)
                .reduce((sum, agent) => sum + (agent.duration || 0), 0);
            this.metrics.performance.averageAgentDuration = Math.round(totalDuration / this.metrics.agents.totalExecuted);
        }
    }

    /**
     * Record agent execution start
     */
    startAgent(agentName) {
        return {
            name: agentName,
            startTime: Date.now()
        };
    }

    /**
     * Record agent execution completion
     */
    completeAgent(agentContext, success, result = {}) {
        const duration = Date.now() - agentContext.startTime;

        this.metrics.agents.totalExecuted++;
        if (success) {
            this.metrics.agents.successful++;
        } else {
            this.metrics.agents.failed++;
        }

        // Track per-agent metrics
        if (!this.metrics.agents.byName[agentContext.name]) {
            this.metrics.agents.byName[agentContext.name] = {
                executions: 0,
                successes: 0,
                failures: 0,
                totalDuration: 0,
                duration: 0
            };
        }

        const agentMetrics = this.metrics.agents.byName[agentContext.name];
        agentMetrics.executions++;
        agentMetrics.totalDuration += duration;
        agentMetrics.duration = duration;
        if (success) agentMetrics.successes++;
        else agentMetrics.failures++;

        // Update performance metrics
        if (!this.metrics.performance.longestAgent.name || duration > this.metrics.performance.longestAgent.duration) {
            this.metrics.performance.longestAgent = { name: agentContext.name, duration };
        }
        if (!this.metrics.performance.shortestAgent.name || duration < this.metrics.performance.shortestAgent.duration) {
            this.metrics.performance.shortestAgent = { name: agentContext.name, duration };
        }

        // Parse result for issues
        if (result.issues) {
            this.recordIssues(result.issues);
        }
        if (result.fixes) {
            this.metrics.issues.resolved += result.fixes.length;
        }
    }

    /**
     * Record test execution results
     */
    recordTestExecution(success, testOutput = '') {
        this.metrics.tests.totalRuns++;

        if (success) {
            this.metrics.tests.passed++;
        } else {
            this.metrics.tests.failed++;
        }

        // Try to parse test output for more details
        this.parseTestOutput(testOutput);
    }

    /**
     * Skip test execution
     */
    recordTestSkipped(reason = '') {
        this.metrics.tests.skipped++;
    }

    /**
     * Record issues found by agents
     */
    recordIssues(issues) {
        this.metrics.issues.found += issues.length;
        this.metrics.issues.open += issues.length;

        for (const issue of issues) {
            // Count by severity
            if (issue.severity && this.metrics.issues.bySeverity[issue.severity] !== undefined) {
                this.metrics.issues.bySeverity[issue.severity]++;
            }

            // Count by type
            if (issue.type) {
                if (!this.metrics.issues.byType[issue.type]) {
                    this.metrics.issues.byType[issue.type] = 0;
                }
                this.metrics.issues.byType[issue.type]++;
            }
        }
    }

    /**
     * Record issue resolution
     */
    recordIssueResolved(issue) {
        this.metrics.issues.resolved++;
        this.metrics.issues.open = Math.max(0, this.metrics.issues.open - 1);
    }

    /**
     * Record file modifications
     */
    recordFileChanges(modifiedFiles = [], createdFiles = [], deletedFiles = []) {
        this.metrics.files.modified += modifiedFiles.length;
        this.metrics.files.created += createdFiles.length;
        this.metrics.files.deleted += deletedFiles.length;
    }

    /**
     * Record files analyzed by agents
     */
    recordFilesAnalyzed(count) {
        this.metrics.files.analyzed += count;
    }

    /**
     * Record coordination activity
     */
    recordCoordinationActivity(type, count = 1) {
        switch (type) {
            case 'finding':
                this.metrics.coordination.findingsShared += count;
                break;
            case 'issue':
                this.metrics.coordination.issuesReported += count;
                break;
            case 'fix':
                this.metrics.coordination.fixesReported += count;
                break;
            case 'help':
                this.metrics.coordination.helpRequests += count;
                break;
            case 'interaction':
                this.metrics.coordination.agentInteractions += count;
                break;
        }
    }

    /**
     * Record token usage
     */
    recordTokenUsage(tokens) {
        this.metrics.performance.totalTokens += tokens;
    }

    /**
     * Parse test output to extract detailed metrics
     */
    parseTestOutput(output) {
        // Jest output parsing
        const jestMatch = output.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/);
        if (jestMatch) {
            // Jest reports this way, we've already counted the execution
            return;
        }

        // Pytest output parsing
        const pytestMatch = output.match(/(\d+)\s+passed/);
        if (pytestMatch) {
            // Already counted
            return;
        }

        // Mocha output parsing
        const mochaMatch = output.match(/(\d+)\s+passing/);
        if (mochaMatch) {
            // Already counted
            return;
        }
    }

    /**
     * Get metrics summary for display
     */
    getSummary() {
        return {
            totalAgents: this.metrics.agents.totalExecuted,
            successfulAgents: this.metrics.agents.successful,
            failedAgents: this.metrics.agents.failed,
            totalDuration: this.metrics.session.duration,
            testsRun: this.metrics.tests.totalRuns,
            testsPassed: this.metrics.tests.passed,
            testsFailed: this.metrics.tests.failed,
            issuesFound: this.metrics.issues.found,
            issuesResolved: this.metrics.issues.resolved,
            issuesOpen: this.metrics.issues.open,
            filesModified: this.metrics.files.modified,
            filesAnalyzed: this.metrics.files.analyzed,
            coordinationActivity: this.metrics.coordination.findingsShared +
                this.metrics.coordination.issuesReported +
                this.metrics.coordination.fixesReported
        };
    }

    /**
     * Get full metrics object
     */
    getFullMetrics() {
        return this.metrics;
    }

    /**
     * Save metrics to disk
     */
    async save() {
        const metricsPath = path.join(this.sessionDir, 'metrics.json');
        await fs.writeJSON(metricsPath, this.metrics, { spaces: 2 });
    }

    /**
     * Load metrics from disk
     */
    async load() {
        const metricsPath = path.join(this.sessionDir, 'metrics.json');
        if (await fs.pathExists(metricsPath)) {
            this.metrics = await fs.readJSON(metricsPath);
        }
    }

    /**
     * Export metrics to CSV format
     */
    toCSV() {
        const rows = [];
        rows.push(['Metric', 'Value']);
        rows.push(['Total Agents', this.metrics.agents.totalExecuted]);
        rows.push(['Successful Agents', this.metrics.agents.successful]);
        rows.push(['Failed Agents', this.metrics.agents.failed]);
        rows.push(['Tests Run', this.metrics.tests.totalRuns]);
        rows.push(['Tests Passed', this.metrics.tests.passed]);
        rows.push(['Tests Failed', this.metrics.tests.failed]);
        rows.push(['Issues Found', this.metrics.issues.found]);
        rows.push(['Issues Resolved', this.metrics.issues.resolved]);
        rows.push(['Files Modified', this.metrics.files.modified]);
        rows.push(['Session Duration (ms)', this.metrics.session.duration]);

        return rows.map(row => row.join(',')).join('\n');
    }
}

module.exports = MetricsCollector;
