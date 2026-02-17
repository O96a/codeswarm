const MetricsCollector = require('../../src/metrics-collector');
const fs = require('fs-extra');
const path = require('path');

describe('MetricsCollector', () => {
    let metrics;
    let testDir;

    beforeEach(() => {
        testDir = path.join(__dirname, 'test-session');
        metrics = new MetricsCollector(testDir);
    });

    afterEach(async () => {
        await fs.remove(testDir);
    });

    describe('Session Management', () => {
        test('initializes with default metrics', () => {
            expect(metrics.metrics).toBeDefined();
            expect(metrics.metrics.agents.totalExecuted).toBe(0);
            expect(metrics.metrics.tests.totalRuns).toBe(0);
            expect(metrics.metrics.issues.found).toBe(0);
        });

        test('starts session with timestamp', () => {
            metrics.startSession();
            expect(metrics.metrics.session.startTime).toBeDefined();
            expect(metrics.metrics.session.startTime).toBeGreaterThan(0);
        });

        test('ends session and calculates duration', () => {
            metrics.startSession();
            const startTime = metrics.metrics.session.startTime;

            setTimeout(() => {
                metrics.endSession();
                expect(metrics.metrics.session.endTime).toBeGreaterThan(startTime);
                expect(metrics.metrics.session.duration).toBeGreaterThan(0);
            }, 100);
        });
    });

    describe('Agent Metrics', () => {
        test('tracks agent execution', () => {
            const context = metrics.startAgent('api-detective');
            expect(context.name).toBe('api-detective');
            expect(context.startTime).toBeDefined();
        });

        test('records successful agent completion', () => {
            const context = metrics.startAgent('api-detective');
            const result = {
                issues: [{ severity: 'high' }, { severity: 'medium' }]
            };

            metrics.completeAgent(context, true, result);

            expect(metrics.metrics.agents.totalExecuted).toBe(1);
            expect(metrics.metrics.agents.successful).toBe(1);
            expect(metrics.metrics.agents.failed).toBe(0);
            expect(metrics.metrics.issues.found).toBe(2);
        });

        test('records failed agent execution', () => {
            const context = metrics.startAgent('api-detective');
            metrics.completeAgent(context, false);

            expect(metrics.metrics.agents.totalExecuted).toBe(1);
            expect(metrics.metrics.agents.successful).toBe(0);
            expect(metrics.metrics.agents.failed).toBe(1);
        });

        test('tracks per-agent statistics', () => {
            const context = metrics.startAgent('api-detective');
            metrics.completeAgent(context, true);

            expect(metrics.metrics.agents.byName['api-detective']).toBeDefined();
            expect(metrics.metrics.agents.byName['api-detective'].executions).toBe(1);
            expect(metrics.metrics.agents.byName['api-detective'].successes).toBe(1);
        });

        test('tracks longest and shortest agent durations', () => {
            const ctx1 = metrics.startAgent('fast-agent');
            setTimeout(() => metrics.completeAgent(ctx1, true), 10);

            const ctx2 = metrics.startAgent('slow-agent');
            setTimeout(() => {
                metrics.completeAgent(ctx2, true);

                expect(metrics.metrics.performance.longestAgent.name).toBe('slow-agent');
                expect(metrics.metrics.performance.shortestAgent.name).toBe('fast-agent');
            }, 100);
        });
    });

    describe('Test Metrics', () => {
        test('records successful test execution', () => {
            metrics.recordTestExecution(true, 'Tests passed');

            expect(metrics.metrics.tests.totalRuns).toBe(1);
            expect(metrics.metrics.tests.passed).toBe(1);
            expect(metrics.metrics.tests.failed).toBe(0);
        });

        test('records failed test execution', () => {
            metrics.recordTestExecution(false);

            expect(metrics.metrics.tests.totalRuns).toBe(1);
            expect(metrics.metrics.tests.passed).toBe(0);
            expect(metrics.metrics.tests.failed).toBe(1);
        });

        test('records skipped tests', () => {
            metrics.recordTestSkipped('No test command');
            expect(metrics.metrics.tests.skipped).toBe(1);
        });
    });

    describe('Issue Tracking', () => {
        test('records issues by severity', () => {
            const issues = [
                { severity: 'critical', type: 'api' },
                { severity: 'high', type: 'api' },
                { severity: 'medium', type: 'ui' }
            ];

            metrics.recordIssues(issues);

            expect(metrics.metrics.issues.found).toBe(3);
            expect(metrics.metrics.issues.bySeverity.critical).toBe(1);
            expect(metrics.metrics.issues.bySeverity.high).toBe(1);
            expect(metrics.metrics.issues.bySeverity.medium).toBe(1);
        });

        test('tracks issues by type', () => {
            const issues = [
                { type: 'api-error' },
                { type: 'api-error' },
                { type: 'ui-bug' }
            ];

            metrics.recordIssues(issues);

            expect(metrics.metrics.issues.byType['api-error']).toBe(2);
            expect(metrics.metrics.issues.byType['ui-bug']).toBe(1);
        });

        test('records issue resolution', () => {
            const issues = [{ severity: 'high' }];
            metrics.recordIssues(issues);

            metrics.recordIssueResolved({ id: '1' });

            expect(metrics.metrics.issues.resolved).toBe(1);
            expect(metrics.metrics.issues.open).toBe(0);
        });
    });

    describe('File Change Metrics', () => {
        test('records file modifications', () => {
            metrics.recordFileChanges(['file1.js', 'file2.js'], ['file3.js'], ['file4.js']);

            expect(metrics.metrics.files.modified).toBe(2);
            expect(metrics.metrics.files.created).toBe(1);
            expect(metrics.metrics.files.deleted).toBe(1);
        });

        test('records files analyzed', () => {
            metrics.recordFilesAnalyzed(10);
            expect(metrics.metrics.files.analyzed).toBe(10);
        });
    });

    describe('Coordination Metrics', () => {
        test('records coordination activity', () => {
            metrics.recordCoordinationActivity('finding', 5);
            metrics.recordCoordinationActivity('issue', 3);
            metrics.recordCoordinationActivity('fix', 2);

            expect(metrics.metrics.coordination.findingsShared).toBe(5);
            expect(metrics.metrics.coordination.issuesReported).toBe(3);
            expect(metrics.metrics.coordination.fixesReported).toBe(2);
        });
    });

    describe('Summary Generation', () => {
        test('generates complete summary', () => {
            metrics.startSession();
            const ctx = metrics.startAgent('test-agent');
            metrics.completeAgent(ctx, true, { issues: [{ severity: 'high' }] });
            metrics.recordTestExecution(true);
            metrics.recordFileChanges(['file1.js'], [], []);

            const summary = metrics.getSummary();

            expect(summary.totalAgents).toBe(1);
            expect(summary.testsRun).toBe(1);
            expect(summary.issuesFound).toBe(1);
            expect(summary.filesModified).toBe(1);
        });
    });

    describe('Persistence', () => {
        test('saves metrics to disk', async () => {
            await fs.ensureDir(testDir);

            metrics.startSession();
            await metrics.save();

            const metricsPath = path.join(testDir, 'metrics.json');
            const exists = await fs.pathExists(metricsPath);
            expect(exists).toBe(true);
        });

        test('loads metrics from disk', async () => {
            await fs.ensureDir(testDir);

            metrics.startSession();
            const ctx = metrics.startAgent('test');
            metrics.completeAgent(ctx, true);
            await metrics.save();

            const newMetrics = new MetricsCollector(testDir);
            await newMetrics.load();

            expect(newMetrics.metrics.agents.totalExecuted).toBe(1);
        });
    });

    describe('CSV Export', () => {
        test('exports metrics to CSV format', () => {
            metrics.startSession();
            const ctx = metrics.startAgent('test');
            metrics.completeAgent(ctx, true);

            const csv = metrics.toCSV();

            expect(csv).toContain('Metric,Value');
            expect(csv).toContain('Total Agents,1');
        });
    });
});
