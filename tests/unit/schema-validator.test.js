const SchemaValidator = require('../../src/schema-validator');

describe('SchemaValidator', () => {
    let validator;

    beforeEach(() => {
        validator = new SchemaValidator();
    });

    describe('Config Validation', () => {
        test('validates a valid config', () => {
            const config = {
                model: 'qwen3-coder',
                context_window: 128000,
                ollama_url: 'http://localhost:11434',
                safety: {
                    auto_apply: false,
                    require_tests: true,
                    max_files_per_agent: 10,
                    token_budget_per_agent: 50000,
                    rollback_on_failure: true
                },
                execution: {
                    parallel_agents: 1,
                    pause_on_error: true,
                    auto_commit: false
                },
                project_context: {
                    type: 'node',
                    test_command: 'npm test',
                    ignored_paths: ['node_modules']
                }
            };

            const result = validator.validateConfig(config);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('rejects config with missing required fields', () => {
            const config = {
                model: 'qwen3-coder'
                // Missing safety, execution, project_context
            };

            const result = validator.validateConfig(config);
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        test('rejects config with invalid project type', () => {
            const config = {
                model: 'qwen3-coder',
                safety: { auto_apply: false, require_tests: true, rollback_on_failure: true },
                execution: { parallel_agents: 1, pause_on_error: true },
                project_context: { type: 'invalid-type' }
            };

            const result = validator.validateConfig(config);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('project_context'))).toBe(true);
        });

        test('rejects config with invalid parallel_agents count', () => {
            const config = {
                model: 'qwen3-coder',
                safety: { auto_apply: false, require_tests: true, rollback_on_failure: true },
                execution: { parallel_agents: 100, pause_on_error: true }, // Max is 10
                project_context: { type: 'node' }
            };

            const result = validator.validateConfig(config);
            expect(result.valid).toBe(false);
        });
    });

    describe('Workflow Validation', () => {
        test('validates a valid workflow', () => {
            const workflow = {
                name: 'investigate',
                description: 'Investigation workflow',
                coordination_enabled: true,
                steps: [
                    {
                        name: 'API Analysis',
                        type: 'agent',
                        agent: 'api-detective'
                    }
                ]
            };

            const result = validator.validateWorkflow(workflow);
            expect(result.valid).toBe(true);
        });

        test('rejects workflow with invalid step type', () => {
            const workflow = {
                name: 'test',
                description: 'Test',
                steps: [
                    {
                        name: 'Invalid',
                        type: 'invalid-type'
                    }
                ]
            };

            const result = validator.validateWorkflow(workflow);
            expect(result.valid).toBe(false);
        });

        test('rejects workflow with empty steps', () => {
            const workflow = {
                name: 'test',
                description: 'Test',
                steps: []
            };

            const result = validator.validateWorkflow(workflow);
            expect(result.valid).toBe(false);
        });
    });

    describe('Pipeline Validation', () => {
        test('validates a valid pipeline', () => {
            const pipeline = {
                name: 'cautious',
                strategy: 'cautious',
                description: 'Safe pipeline',
                phases: [
                    {
                        name: 'Investigation',
                        workflows: ['investigate'],
                        auto_approve_low_risk: false
                    }
                ]
            };

            const result = validator.validatePipeline(pipeline);
            expect(result.valid).toBe(true);
        });

        test('rejects pipeline with invalid strategy', () => {
            const pipeline = {
                name: 'test',
                strategy: 'invalid',
                phases: [{ name: 'Test', workflows: ['test'] }]
            };

            const result = validator.validatePipeline(pipeline);
            expect(result.valid).toBe(false);
        });
    });

    describe('Agent Config Validation', () => {
        test('validates a valid agent config', () => {
            const agentConfig = {
                name: 'API Detective',
                type: 'investigator',
                risk_level: 'low',
                instructions: 'Investigate API issues in the codebase.'
            };

            const result = validator.validateAgentConfig(agentConfig);
            expect(result.valid).toBe(true);
        });

        test('rejects agent config with invalid type', () => {
            const agentConfig = {
                name: 'Test',
                type: 'invalid-type',
                instructions: 'Test'
            };

            const result = validator.validateAgentConfig(agentConfig);
            expect(result.valid).toBe(false);
        });

        test('rejects agent config with too short instructions', () => {
            const agentConfig = {
                name: 'Test',
                type: 'investigator',
                instructions: 'Short'
            };

            const result = validator.validateAgentConfig(agentConfig);
            expect(result.valid).toBe(false);
        });
    });

    describe('Agent Output Validation', () => {
        test('validates valid agent output', () => {
            const output = {
                success: true,
                output: 'Agent completed successfully',
                findings: [],
                issues: [],
                fixes: []
            };

            const result = validator.validateAgentOutput(output);
            expect(result.valid).toBe(true);
        });

        test('rejects output missing required fields', () => {
            const output = {
                success: true
                // Missing output field
            };

            const result = validator.validateAgentOutput(output);
            expect(result.valid).toBe(false);
        });
    });
});
