const { v4: uuidv4 } = require('uuid');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const GitManager = require('./git-manager');
const AgentRunner = require('./agent-runner');
const ReportGenerator = require('./report-generator');
const SafetyManager = require('./safety-manager');
const CoordinationHub = require('./coordination-hub');

class Orchestrator {
  constructor(config) {
    this.config = config;
    this.sessionId = uuidv4();
    this.sessionDir = path.join(process.cwd(), '.codeswarm', 'sessions', this.sessionId);
    this.gitManager = new GitManager();
    this.agentRunner = new AgentRunner(config);
    this.reportGenerator = new ReportGenerator(this.sessionDir);
    this.safetyManager = new SafetyManager(config);
    this.coordinationHub = new CoordinationHub(this.sessionDir);
    this.executionLog = [];
    this.rollbackPoints = [];
  }

  async initialize() {
    console.log(chalk.blue.bold('\n🚀 Initializing CodeSwarm Session\n'));
    
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
      throw error;
    }

    // Create snapshot
    const snapshot = await this.gitManager.createSnapshot(this.sessionId);
    this.executionLog.push({
      timestamp: new Date(),
      type: 'snapshot',
      data: snapshot
    });

    console.log(chalk.green(`\n✓ Session initialized: ${this.sessionId}\n`));
  }

  async runAgent(agentName, options = {}) {
    console.log(chalk.blue.bold(`\n🤖 Running Agent: ${agentName}\n`));

    const agentId = uuidv4();
    const startTime = Date.now();

    try {
      // Create rollback point
      const rollbackPoint = await this.createRollbackPoint(agentName);

      // Load agent configuration
      const agentConfig = await this.loadAgentConfig(agentName);

      // Check if coordination is needed
      if (agentConfig.coordination && agentConfig.coordination.enabled) {
        await this.coordinationHub.registerAgent(agentId, agentConfig);
      }

      // Run the agent
      const result = await this.agentRunner.execute(agentName, agentConfig, {
        ...options,
        agentId,
        sessionId: this.sessionId,
        coordinationHub: this.coordinationHub
      });

      // Validate results
      if (this.config.safety.require_tests && !options.skipTests) {
        await this.safetyManager.runTests();
      }

      // Record execution
      this.executionLog.push({
        timestamp: new Date(),
        type: 'agent_execution',
        agentId,
        agentName,
        duration: Date.now() - startTime,
        result,
        rollbackPoint
      });

      // Generate agent report
      await this.reportGenerator.generateAgentReport(agentName, result);

      console.log(chalk.green(`\n✓ Agent ${agentName} completed successfully\n`));

      return result;

    } catch (error) {
      console.error(chalk.red(`\n✗ Agent ${agentName} failed: ${error.message}\n`));
      
      // Auto-rollback on failure
      if (this.config.safety.rollback_on_failure) {
        await this.rollbackToLastCheckpoint();
      }

      throw error;
    }
  }

  async runWorkflow(workflowName, options = {}) {
    console.log(chalk.blue.bold(`\n🔄 Running Workflow: ${workflowName}\n`));

    const workflow = await this.loadWorkflow(workflowName);
    const results = [];

    // Initialize coordination for workflow
    if (workflow.coordination_enabled) {
      await this.coordinationHub.initializeWorkflow(workflow);
    }

    for (const step of workflow.steps) {
      console.log(chalk.cyan(`\n→ Workflow Step: ${step.name}\n`));

      if (step.type === 'agent') {
        const result = await this.runAgent(step.agent, {
          ...options,
          ...step.options
        });
        results.push({ step: step.name, result });

        // Check if we should continue
        if (step.stop_on_failure && result.failed) {
          console.log(chalk.yellow('\n⚠ Stopping workflow due to failure\n'));
          break;
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

  async runPipeline(strategy, options = {}) {
    console.log(chalk.blue.bold(`\n🏗️  Running Pipeline: ${strategy}\n`));

    const pipeline = await this.loadPipeline(strategy);
    
    // Set up coordination for entire pipeline
    if (pipeline.full_coordination) {
      await this.coordinationHub.initializePipeline(pipeline);
    }

    const phases = [];

    for (const phase of pipeline.phases) {
      console.log(chalk.magenta.bold(`\n═══ Phase: ${phase.name} ═══\n`));

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
      await this.gitManager.createTag(`codeswarm-checkpoint-${name}-${Date.now()}`);
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
    const agentPath = path.join(process.cwd(), '.codeswarm', 'agents', `${agentName}.yml`);
    
    if (!await fs.pathExists(agentPath)) {
      throw new Error(`Agent not found: ${agentName}`);
    }

    const yaml = require('yaml');
    const content = await fs.readFile(agentPath, 'utf8');
    return yaml.parse(content);
  }

  async loadWorkflow(workflowName) {
    const workflowPath = path.join(process.cwd(), '.codeswarm', 'workflows', `${workflowName}.json`);
    
    if (!await fs.pathExists(workflowPath)) {
      throw new Error(`Workflow not found: ${workflowName}`);
    }

    return await fs.readJSON(workflowPath);
  }

  async loadPipeline(strategy) {
    const pipelinePath = path.join(process.cwd(), '.codeswarm', 'pipelines', `${strategy}.json`);
    
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
    // Calculate various statistics
    return {
      totalAgents: this.executionLog.filter(e => e.type === 'agent_execution').length,
      totalDuration: this.executionLog.reduce((acc, e) => acc + (e.duration || 0), 0),
      filesModified: await this.gitManager.getModifiedFiles().then(f => f.length),
      testsRun: 0, // TODO: Implement
      issuesFound: 0, // TODO: Implement
      issuesResolved: 0 // TODO: Implement
    };
  }
}

module.exports = Orchestrator;
