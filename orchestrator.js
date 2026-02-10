const { v4: uuidv4 } = require('uuid');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const ui = require('./ui-formatter');
const GitManager = require('./git-manager');
const AgentRunner = require('./agent-runner');
const ReportGenerator = require('./report-generator');
const SafetyManager = require('./safety-manager');
const CoordinationHub = require('./coordination-hub');
const MetricsCollector = require('./metrics-collector');
const SchemaValidator = require('./schema-validator');
const CredentialManager = require('./credential-manager');
const { LLMProviderManager } = require('./llm-provider');
const OllamaCloudProvider = require('./providers/ollama-cloud');
const OllamaLocalProvider = require('./providers/ollama-local');
const ClaudeCodeProvider = require('./providers/claude-code');
const { ParallelExecutor } = require('./parallel-executor');

class Orchestrator {
  constructor(config) {
    this.config = config;
    this.sessionId = uuidv4();
    this.sessionDir = path.join(process.cwd(), '.mehaisi', 'sessions', this.sessionId);
    this.gitManager = new GitManager();

    // Initialize Credential Manager
    const configPath = path.join(process.cwd(), '.mehaisi', 'config.json');
    this.credentialManager = new CredentialManager(configPath);

    // Initialize LLM Provider Manager
    this.providerManager = new LLMProviderManager(config);
    this.initializeProviders();

    this.agentRunner = new AgentRunner(config, this.providerManager);
    this.reportGenerator = new ReportGenerator(this.sessionDir);
    this.safetyManager = new SafetyManager(config);
    this.coordinationHub = new CoordinationHub(this.sessionDir, config);
    this.metrics = new MetricsCollector(this.sessionDir);
    this.validator = new SchemaValidator();
    this.executionLog = [];
    this.rollbackPoints = [];
    this.maxRetries = config.max_retries || 3;

    // Initialize parallel executor
    this.parallelExecutor = new ParallelExecutor(
      this.agentRunner,
      config.execution || {}
    );
  }

  /**
   * Initialize and register LLM providers
   */
  initializeProviders() {
    // Register available providers from config
    const providers = this.config.llm?.providers || {};

    // Register Ollama Cloud provider with credential manager
    if (providers['ollama-cloud']) {
      this.providerManager.register(
        'ollama-cloud',
        new OllamaCloudProvider(providers['ollama-cloud'], this.credentialManager)
      );
    }

    // Register Ollama Local provider
    if (providers['ollama-local']) {
      this.providerManager.register(
        'ollama-local',
        new OllamaLocalProvider(providers['ollama-local'])
      );
    }

    // Register Claude Code provider
    if (providers['claude-code']) {
      this.providerManager.register(
        'claude-code',
        new ClaudeCodeProvider(providers['claude-code'])
      );
    }
  }

  async initialize() {
    ui.header('Initializing Mehaisi Session', 'rocket');

    try {
      // Create session directory
      await fs.ensureDir(this.sessionDir);
      await fs.ensureDir(path.join(this.sessionDir, 'reports'));
      await fs.ensureDir(path.join(this.sessionDir, 'diffs'));
      await fs.ensureDir(path.join(this.sessionDir, 'checkpoints'));
      await fs.ensureDir(path.join(this.sessionDir, 'coordination'));

      // Pre-flight checks
      const spinner = ora('Running pre-flight checks...').start();

      try {
        await this.safetyManager.runPreflightChecks();
        spinner.succeed('Pre-flight checks passed');
      } catch (error) {
        spinner.fail('Pre-flight checks failed');
        throw new Error(`Pre-flight check failed: ${error.message}`);
      }

      // Initialize metrics
      this.metrics.startSession();

      // Create snapshot with error handling
      let snapshot;
      try {
        snapshot = await this.gitManager.createSnapshot(this.sessionId);
      } catch (error) {
        throw new Error(`Failed to create git snapshot: ${error.message}. Ensure you're in a git repository.`);
      }

      this.executionLog.push({
        timestamp: new Date(),
        type: 'snapshot',
        data: snapshot
      });

      console.log(chalk.green(`\n${ui.icons.success} Session ID: ${chalk.cyan(this.sessionId)}\n`));
    } catch (error) {
      console.error(chalk.red(`${ui.icons.error} Initialization failed: ${error.message}\n`));
      throw error;
    }
  }

  async runAgent(agentName, options = {}) {
    ui.agentStart(agentName);

    const agentId = uuidv4();
    const agentContext = this.metrics.startAgent(agentName);
    let rollbackPoint;

    try {
      // Create rollback point
      rollbackPoint = await this.createRollbackPoint(agentName);

      // Load agent configuration with validation
      const agentConfig = await this.loadAgentConfig(agentName);
      const validation = this.validator.validateAgentConfig(agentConfig);
      if (!validation.valid) {
        throw new Error(`Invalid agent config for ${agentName}: ${validation.errors.join(', ')}`);
      }

      // Check if coordination is needed
      if (agentConfig.coordination && agentConfig.coordination.enabled) {
        await this.coordinationHub.registerAgent(agentId, agentConfig);
      }

      // Run the agent with retry logic for transient failures
      let result;
      let lastError;
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          result = await this.agentRunner.execute(agentName, agentConfig, {
            ...options,
            agentId,
            sessionId: this.sessionId,
            coordinationHub: this.coordinationHub
          });
          break; // Success, exit retry loop
        } catch (err) {
          lastError = err;
          if (attempt < this.maxRetries && this.isTransientError(err)) {
            console.log(chalk.yellow(`  ⚠ Attempt ${attempt} failed, retrying... (${err.message})\n`));
            await this.sleep(1000 * attempt); // Exponential backoff
          } else {
            throw err; // Not retryable or max retries reached
          }
        }
      }

      // Validate results
      if (this.config.safety.require_tests && !options.skipTests) {
        try {
          const testSuccess = await this.safetyManager.runTests();
          this.metrics.recordTestExecution(testSuccess);
        } catch (testError) {
          this.metrics.recordTestExecution(false);
          throw testError;
        }
      } else if (options.skipTests) {
        this.metrics.recordTestSkipped('Skipped via options');
      }

      // Record execution
      this.executionLog.push({
        timestamp: new Date(),
        type: 'agent_execution',
        agentId,
        agentName,
        duration: Date.now() - agentContext.startTime,
        result,
        rollbackPoint
      });

      // Record metrics
      this.metrics.completeAgent(agentContext, true, result);

      // Generate agent report
      await this.reportGenerator.generateAgentReport(agentName, result);

      ui.success(`Agent ${agentName} completed`, true);
      console.log('');

      return result;

    } catch (error) {
      ui.error(`Agent ${agentName} failed: ${error.message}`, true);
      console.log('');

      // Record failed metrics
      this.metrics.completeAgent(agentContext, false);

      // Auto-rollback on failure
      if (this.config.safety.rollback_on_failure && rollbackPoint) {
        try {
          console.log(chalk.yellow('  ↺ Rolling back changes...'));
          await this.rollbackToLastCheckpoint();
          console.log(chalk.green('  ✓ Rollback completed'));
        } catch (rollbackError) {
          console.error(chalk.red(`  ✗ Rollback failed: ${rollbackError.message}`));
        }
      }

      throw error;
    }
  }

  async runWorkflow(workflowName, options = {}) {
    ui.section(`Workflow: ${chalk.bold(workflowName)}`);
    ui.divider();

    const workflow = await this.loadWorkflow(workflowName);
    const results = [];

    // Initialize coordination for workflow
    if (workflow.coordination_enabled) {
      await this.coordinationHub.initializeWorkflow(workflow);
    }

    for (const step of workflow.steps) {
      ui.item(`${step.name}`, 0);

      if (step.type === 'agent') {
        // Determine which agent to run
        let agentToRun = step.agent;

        // Optionally use intelligent routing to select best agent
        if (step.auto_select_agent && step.task_description) {
          const routing = await this.coordinationHub.recommendAgentForTask({
            name: step.name,
            description: step.task_description,
            requiredCapability: step.required_capability,
            type: step.agent_type
          });

          if (routing.agent) {
            console.log(chalk.blue(`  🧠 Intelligent routing selected: ${routing.agent.name} (confidence: ${(routing.confidence * 100).toFixed(0)}%)`));
            console.log(chalk.gray(`     Reason: ${routing.reason}\n`));
            agentToRun = routing.agent.name;
          } else {
            console.log(chalk.yellow(`  ⚠ Auto-select failed, using default: ${step.agent}\n`));
          }
        }

        const result = await this.runAgent(agentToRun, {
          ...options,
          ...step.options
        });
        results.push({ step: step.name, result });

        // Check if we should continue
        if (step.stop_on_failure && result.failed) {
          console.log(chalk.yellow('\n⚠ Stopping workflow due to failure\n'));
          break;
        }
      } else if (step.type === 'parallel') {
        // Handle parallel execution of multiple agents
        const parallelResults = await this.executeParallelAgents(step.agents, {
          ...options,
          ...step.options,
          coordinationHub: this.coordinationHub
        });

        results.push({ step: step.name, results: parallelResults });

        // Check if we should stop on failure
        if (step.stop_on_failure) {
          const hasFailures = parallelResults.some(r => r.status === 'rejected' || !r.value?.success);
          if (hasFailures) {
            console.log(chalk.yellow('\n⚠ Stopping workflow due to parallel execution failure\n'));
            break;
          }
        }
      } else if (step.type === 'coordination') {
        await this.coordinationHub.coordinateStep(step, results);
      } else if (step.type === 'checkpoint') {
        await this.createCheckpoint(step.name);
      }

      // Pause for user review if needed
      if (step.require_approval && !options.autoApprove) {
        await this.pauseForApproval(step.name);
      }
    }

    return results;
  }

  /**
   * Execute multiple agents in parallel
   * @param {Array<string>} agents - List of agent names
   * @param {Object} options - Common options for all agents
   * @returns {Promise<Array>} Results from all agents
   */
  async executeParallelAgents(agents, options = {}) {
    console.log(chalk.blue(`\n🚀 Executing ${agents.length} agents in parallel\n`));

    // Map agent names to tasks for parallel executor
    const tasks = agents.map(agentName => ({
      agentName,
      options: {
        coordinationHub: this.coordinationHub,
        ...options,
        // We'll let parallel-executor generate/manage unique agent IDs
      }
    }));

    try {
      return await this.parallelExecutor.executeParallel(tasks);
    } catch (error) {
      console.error(chalk.red(`\n✗ Parallel execution failed: ${error.message}\n`));
      throw error;
    }
  }

  async runPipeline(strategy, options = {}) {
    ui.header(`Pipeline: ${strategy.toUpperCase()}`, 'rocket');

    const pipeline = await this.loadPipeline(strategy);

    // Set up coordination for entire pipeline
    if (pipeline.full_coordination) {
      await this.coordinationHub.initializePipeline(pipeline);
    }

    const phases = [];

    for (const phase of pipeline.phases) {
      ui.phase(phase.name);

      const phaseResults = [];

      for (const workflowName of phase.workflows) {
        const result = await this.runWorkflow(workflowName, {
          ...options,
          autoApproveLowRisk: phase.auto_approve_low_risk
        });
        phaseResults.push({ workflow: workflowName, result });
      }

      phases.push({
        phase: phase.name,
        results: phaseResults
      });

      // Create checkpoint after each phase
      await this.createCheckpoint(`phase-${phase.name}`);

      // Generate phase report
      await this.reportGenerator.generatePhaseReport(phase.name, phaseResults);
    }

    // Generate final session report
    await this.generateSessionReport(phases);

    return phases;
  }

  async createRollbackPoint(name) {
    const commit = await this.gitManager.getCurrentCommit();
    const rollbackPoint = {
      id: uuidv4(),
      name,
      commit,
      timestamp: new Date()
    };

    this.rollbackPoints.push(rollbackPoint);

    // Save rollback point to disk
    await fs.writeJSON(
      path.join(this.sessionDir, 'checkpoints', `${rollbackPoint.id}.json`),
      rollbackPoint,
      { spaces: 2 }
    );

    return rollbackPoint;
  }

  async createCheckpoint(name) {
    const spinner = ora(`Creating checkpoint: ${name}...`).start();

    try {
      await this.gitManager.createTag(`mehaisi-checkpoint-${name}-${Date.now()}`);
      await this.createRollbackPoint(name);
      spinner.succeed(`Checkpoint created: ${name}`);
    } catch (error) {
      spinner.fail(`Failed to create checkpoint: ${error.message}`);
      throw error;
    }
  }

  async rollbackToLastCheckpoint() {
    if (this.rollbackPoints.length === 0) {
      console.log(chalk.yellow('No checkpoints available for rollback'));
      return;
    }

    const lastCheckpoint = this.rollbackPoints[this.rollbackPoints.length - 1];
    console.log(chalk.yellow(`\n↺ Rolling back to: ${lastCheckpoint.name}\n`));

    await this.gitManager.rollbackToCommit(lastCheckpoint.commit);
  }

  async pauseForApproval(stepName) {
    const inquirer = require('inquirer');

    const { proceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: `Review changes from "${stepName}". Continue?`,
        default: true
      }
    ]);

    if (!proceed) {
      throw new Error('Workflow cancelled by user');
    }
  }

  async loadAgentConfig(agentName) {
    const agentPath = path.join(process.cwd(), '.mehaisi', 'agents', `${agentName}.yml`);

    if (!await fs.pathExists(agentPath)) {
      throw new Error(`Agent not found: ${agentName}`);
    }

    const yaml = require('yaml');
    const content = await fs.readFile(agentPath, 'utf8');
    return yaml.parse(content);
  }

  async loadWorkflow(workflowName) {
    const workflowPath = path.join(process.cwd(), '.mehaisi', 'workflows', `${workflowName}.json`);

    if (!await fs.pathExists(workflowPath)) {
      throw new Error(`Workflow not found: ${workflowName}`);
    }

    return await fs.readJSON(workflowPath);
  }

  async loadPipeline(strategy) {
    const pipelinePath = path.join(process.cwd(), '.mehaisi', 'pipelines', `${strategy}.json`);

    if (!await fs.pathExists(pipelinePath)) {
      throw new Error(`Pipeline not found: ${strategy}`);
    }

    return await fs.readJSON(pipelinePath);
  }

  async generateSessionReport(phases) {
    console.log(chalk.blue('\n📊 Generating session report...\n'));

    const report = {
      sessionId: this.sessionId,
      startTime: this.executionLog[0]?.timestamp,
      endTime: new Date(),
      phases,
      executionLog: this.executionLog,
      rollbackPoints: this.rollbackPoints,
      stats: await this.calculateStats()
    };

    await fs.writeJSON(
      path.join(this.sessionDir, 'session-report.json'),
      report,
      { spaces: 2 }
    );

    await this.reportGenerator.generateHTML(report);

    console.log(chalk.green(`\n✓ Session report saved: .codeswarm/sessions/${this.sessionId}/\n`));
  }

  async calculateStats() {
    // Use metrics collector instead of TODOs
    const summary = this.metrics.getSummary();
    const modifiedFiles = await this.gitManager.getModifiedFiles();

    return {
      totalAgents: summary.totalAgents,
      successfulAgents: summary.successfulAgents,
      failedAgents: summary.failedAgents,
      totalDuration: summary.totalDuration,
      filesModified: modifiedFiles.all.length,
      filesCreated: modifiedFiles.created.length,
      filesDeleted: modifiedFiles.deleted.length,
      testsRun: summary.testsRun,
      testsPassed: summary.testsPassed,
      testsFailed: summary.testsFailed,
      issuesFound: summary.issuesFound,
      issuesResolved: summary.issuesResolved,
      issuesOpen: summary.issuesOpen,
      coordinationActivity: summary.coordinationActivity
    };
  }

  /**
   * Check if an error is transient and worth retrying
   */
  isTransientError(error) {
    const transientMessages = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'network',
      'timeout',
      'temporary',
      'lock'
    ];

    const message = error.message.toLowerCase();
    return transientMessages.some(msg => message.includes(msg));
  }

  /**
   * Sleep utility for retry delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = Orchestrator;
