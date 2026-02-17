const Ajv = require('ajv');
const ajv = new Ajv({ allErrors: true, strict: false });

/**
 * Schema Validator - Centralized validation for all CodeSwarm data structures
 * Provides validation for configs, workflows, pipelines, agent outputs, and state files
 */
class SchemaValidator {
    constructor() {
        this.schemas = {
            config: this.getConfigSchema(),
            workflow: this.getWorkflowSchema(),
            pipeline: this.getPipelineSchema(),
            agentConfig: this.getAgentConfigSchema(),
            agentOutput: this.getAgentOutputSchema(),
            coordinationState: this.getCoordinationStateSchema()
        };

        // Compile schemas
        this.validators = {};
        for (const [name, schema] of Object.entries(this.schemas)) {
            this.validators[name] = ajv.compile(schema);
        }
    }

    /**
     * Validate configuration file
     */
    validateConfig(config) {
        return this.validate('config', config);
    }

    /**
     * Validate workflow definition
     */
    validateWorkflow(workflow) {
        return this.validate('workflow', workflow);
    }

    /**
     * Validate pipeline definition
     */
    validatePipeline(pipeline) {
        return this.validate('pipeline', pipeline);
    }

    /**
     * Validate agent configuration
     */
    validateAgentConfig(agentConfig) {
        return this.validate('agentConfig', agentConfig);
    }

    /**
     * Validate agent execution output
     */
    validateAgentOutput(output) {
        return this.validate('agentOutput', output);
    }

    /**
     * Validate coordination hub state
     */
    validateCoordinationState(state) {
        return this.validate('coordinationState', state);
    }

    /**
     * Generic validation method
     */
    validate(schemaName, data) {
        const validator = this.validators[schemaName];
        if (!validator) {
            return {
                valid: false,
                errors: [`Unknown schema: ${schemaName}`]
            };
        }

        const valid = validator(data);
        return {
            valid,
            errors: valid ? [] : this.formatErrors(validator.errors)
        };
    }

    /**
     * Format AJV errors into readable messages
     */
    formatErrors(errors) {
        if (!errors) return [];
        return errors.map(err => {
            const path = err.instancePath || 'root';
            return `${path}: ${err.message}`;
        });
    }

    /**
     * Schema: CodeSwarm Configuration
     */
    getConfigSchema() {
        return {
            type: 'object',
            required: ['model', 'safety', 'execution', 'project_context'],
            properties: {
                model: { type: 'string', minLength: 1 },
                context_window: { type: 'number', minimum: 1000 },
                ollama_url: { type: 'string', format: 'uri' },
                safety: {
                    type: 'object',
                    required: ['auto_apply', 'require_tests', 'rollback_on_failure'],
                    properties: {
                        auto_apply: { type: 'boolean' },
                        require_tests: { type: 'boolean' },
                        max_files_per_agent: { type: 'number', minimum: 1 },
                        token_budget_per_agent: { type: 'number', minimum: 1000 },
                        rollback_on_failure: { type: 'boolean' }
                    }
                },
                execution: {
                    type: 'object',
                    required: ['parallel_agents', 'pause_on_error'],
                    properties: {
                        parallel_agents: { type: 'number', minimum: 1, maximum: 10 },
                        pause_on_error: { type: 'boolean' },
                        auto_commit: { type: 'boolean' }
                    }
                },
                project_context: {
                    type: 'object',
                    required: ['type'],
                    properties: {
                        type: { type: 'string', enum: ['node', 'python', 'rust', 'go', 'docker', 'unknown'] },
                        test_command: { type: 'string' },
                        build_command: { type: 'string' },
                        ignored_paths: {
                            type: 'array',
                            items: { type: 'string' }
                        }
                    }
                }
            }
        };
    }

    /**
     * Schema: Workflow Definition
     */
    getWorkflowSchema() {
        return {
            type: 'object',
            required: ['name', 'description', 'steps'],
            properties: {
                name: { type: 'string', minLength: 1 },
                description: { type: 'string' },
                coordination_enabled: { type: 'boolean' },
                steps: {
                    type: 'array',
                    minItems: 1,
                    items: {
                        type: 'object',
                        required: ['name', 'type'],
                        properties: {
                            name: { type: 'string' },
                            type: { type: 'string', enum: ['agent', 'parallel', 'coordination', 'checkpoint'] },
                            agent: { type: 'string' },
                            agents: {
                                type: 'array',
                                items: { type: 'string' }
                            },
                            require_approval: { type: 'boolean' },
                            stop_on_failure: { type: 'boolean' },
                            options: { type: 'object' }
                        }
                    }
                }
            }
        };
    }

    /**
     * Schema: Pipeline Definition
     */
    getPipelineSchema() {
        return {
            type: 'object',
            required: ['name', 'strategy', 'phases'],
            properties: {
                name: { type: 'string', minLength: 1 },
                strategy: { type: 'string', enum: ['cautious', 'balanced', 'aggressive'] },
                description: { type: 'string' },
                full_coordination: { type: 'boolean' },
                goal: { type: 'string' },
                phases: {
                    type: 'array',
                    minItems: 1,
                    items: {
                        type: 'object',
                        required: ['name', 'workflows'],
                        properties: {
                            name: { type: 'string' },
                            workflows: {
                                type: 'array',
                                items: { type: 'string' }
                            },
                            auto_approve_low_risk: { type: 'boolean' }
                        }
                    }
                }
            }
        };
    }

    /**
     * Schema: Agent Configuration (YAML)
     */
    getAgentConfigSchema() {
        return {
            type: 'object',
            required: ['name', 'type', 'instructions'],
            properties: {
                name: { type: 'string', minLength: 1 },
                type: { type: 'string', enum: ['investigator', 'cleaner', 'fixer', 'builder', 'qa'] },
                risk_level: { type: 'string', enum: ['low', 'medium', 'high'] },
                model: { type: 'string' },
                priority: { type: 'number', minimum: 1, maximum: 10 },
                coordination: { type: 'object' },
                scope: { type: 'object' },
                instructions: { type: 'string', minLength: 10 },
                output: { type: 'object' },
                validation: { type: 'array' },
                metrics: { type: 'array' },
                dependencies: { type: 'object' }
            }
        };
    }

    /**
     * Schema: Agent Execution Output
     */
    getAgentOutputSchema() {
        return {
            type: 'object',
            required: ['success', 'output'],
            properties: {
                success: { type: 'boolean' },
                output: { type: 'string' },
                findings: { type: 'array' },
                issues: { type: 'array' },
                fixes: { type: 'array' },
                error: { type: 'string' }
            }
        };
    }

    /**
     * Schema: Coordination Hub State
     */
    getCoordinationStateSchema() {
        return {
            type: 'object',
            required: ['sharedMemory', 'messageQueue', 'activeAgents'],
            properties: {
                sharedMemory: {
                    type: 'object',
                    required: ['findings', 'issues', 'fixes', 'recommendations', 'agentStates'],
                    properties: {
                        findings: { type: 'array' },
                        issues: { type: 'array' },
                        fixes: { type: 'array' },
                        recommendations: { type: 'array' },
                        agentStates: { type: 'object' }
                    }
                },
                messageQueue: { type: 'array' },
                activeAgents: { type: 'array' }
            }
        };
    }
}

module.exports = SchemaValidator;
