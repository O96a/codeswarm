const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');

async function initializeProject(options) {
  console.log(chalk.blue.bold('\n🎯 Initializing CodeSwarm\n'));

  const cwd = process.cwd();
  const codeswarmDir = path.join(cwd, '.codeswarm');

  // Check if already initialized
  if (await fs.pathExists(codeswarmDir)) {
    const { reinit } = await inquirer.prompt([{
      type: 'confirm',
      name: 'reinit',
      message: 'CodeSwarm already initialized. Reinitialize?',
      default: false
    }]);
    if (!reinit) return;
  }

  const spinner = ora('Creating directory structure...').start();

  try {
    // Create directory structure
    await fs.ensureDir(path.join(codeswarmDir, 'agents'));
    await fs.ensureDir(path.join(codeswarmDir, 'workflows'));
    await fs.ensureDir(path.join(codeswarmDir, 'pipelines'));
    await fs.ensureDir(path.join(codeswarmDir, 'sessions'));
    await fs.ensureDir(path.join(codeswarmDir, 'reports'));

    // Copy agent templates
    const templatesDir = path.join(__dirname, '../../templates/agents');
    if (await fs.pathExists(templatesDir)) {
      await fs.copy(templatesDir, path.join(codeswarmDir, 'agents'));
    }

    // Create default config
    const config = {
      model: options.model || 'qwen3-coder',
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
        type: options.template || 'node',
        test_command: 'npm test',
        build_command: 'npm run build',
        ignored_paths: ['node_modules', 'dist', '.git', 'build', 'coverage']
      }
    };

    await fs.writeJSON(path.join(codeswarmDir, 'config.json'), config, { spaces: 2 });

    // Create default workflows
    await createDefaultWorkflows(codeswarmDir);

    // Create default pipelines
    await createDefaultPipelines(codeswarmDir);

    // Create .gitignore entry
    const gitignorePath = path.join(cwd, '.gitignore');
    if (await fs.pathExists(gitignorePath)) {
      let gitignore = await fs.readFile(gitignorePath, 'utf8');
      if (!gitignore.includes('.codeswarm/sessions')) {
        gitignore += '\n\n# CodeSwarm\n.codeswarm/sessions/\n.codeswarm/reports/\n';
        await fs.writeFile(gitignorePath, gitignore);
      }
    }

    spinner.succeed('CodeSwarm initialized successfully!');

    console.log(chalk.green('\n✓ Directory structure created'));
    console.log(chalk.green(`✓ ${chalk.bold('19')} agents configured`));
    console.log(chalk.green('✓ Default workflows created'));
    console.log(chalk.green('✓ Default pipelines created'));

    console.log(chalk.blue('\n📚 Next steps:'));
    console.log(chalk.white('  1. codeswarm agents --list'));
    console.log(chalk.white('  2. codeswarm run api-detective'));
    console.log(chalk.white('  3. codeswarm workflow investigate'));
    console.log(chalk.white('\nOr run the full pipeline:'));
    console.log(chalk.white('  codeswarm pipeline cautious\n'));

  } catch (error) {
    spinner.fail('Initialization failed');
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

async function createDefaultWorkflows(codeswarmDir) {
  const workflows = {
    investigate: {
      name: 'investigate',
      description: 'Run all investigator agents to find issues',
      coordination_enabled: true,
      steps: [
        { name: 'API Analysis', type: 'agent', agent: 'api-detective' },
        { name: 'UI Analysis', type: 'agent', agent: 'ui-inspector' },
        { name: 'Code Analysis', type: 'agent', agent: 'code-archaeologist' },
        { name: 'Security Scan', type: 'agent', agent: 'security-scanner' },
        { name: 'Dependency Audit', type: 'agent', agent: 'dependency-doctor' },
        { name: 'Accessibility Audit', type: 'agent', agent: 'accessibility-auditor' },
        { name: 'Coordination Summary', type: 'coordination', require_approval: true }
      ]
    },
    cleanup: {
      name: 'cleanup',
      description: 'Clean up dead code and unused dependencies',
      coordination_enabled: true,
      steps: [
        { name: 'Remove Dead Code', type: 'agent', agent: 'code-janitor' }
      ]
    },
    'fix-apis': {
      name: 'fix-apis',
      description: 'Fix API connectivity issues',
      coordination_enabled: true,
      steps: [
        { name: 'Connect APIs', type: 'agent', agent: 'api-connector', require_approval: true }
      ]
    },
    'fix-ui': {
      name: 'fix-ui',
      description: 'Fix UI interaction issues',
      coordination_enabled: true,
      steps: [
        { name: 'Bind Events', type: 'agent', agent: 'event-binder', require_approval: true },
        { name: 'Fix Responsive', type: 'agent', agent: 'responsive-engineer', require_approval: true },
        { name: 'Fix Accessibility', type: 'agent', agent: 'accessibility-fixer', require_approval: true }
      ]
    },
    optimize: {
      name: 'optimize',
      description: 'Optimize performance and code quality',
      coordination_enabled: true,
      steps: [
        { name: 'Refactor Complex Code', type: 'agent', agent: 'refactor-master', require_approval: true },
        { name: 'Optimize Performance', type: 'agent', agent: 'performance-optimizer', require_approval: true },
        { name: 'Add Type Safety', type: 'agent', agent: 'type-enforcer', require_approval: true }
      ]
    },
    validate: {
      name: 'validate',
      description: 'Run quality assurance agents',
      coordination_enabled: true,
      steps: [
        { name: 'Write Tests', type: 'agent', agent: 'test-writer' },
        { name: 'Integration Test', type: 'agent', agent: 'integration-validator' },
        { name: 'Stress Test', type: 'agent', agent: 'stress-tester' },
        { name: 'Production Check', type: 'agent', agent: 'production-checker' }
      ]
    }
  };

  for (const [name, workflow] of Object.entries(workflows)) {
    await fs.writeJSON(
      path.join(codeswarmDir, 'workflows', `${name}.json`),
      workflow,
      { spaces: 2 }
    );
  }
}

async function createDefaultPipelines(codeswarmDir) {
  const pipelines = {
    cautious: {
      name: 'cautious',
      strategy: 'cautious',
      description: 'Safe, step-by-step quality transformation',
      full_coordination: true,
      goal: 'Transform codebase to production quality with maximum safety',
      phases: [
        {
          name: 'Investigation',
          workflows: ['investigate'],
          auto_approve_low_risk: false
        },
        {
          name: 'Cleanup',
          workflows: ['cleanup'],
          auto_approve_low_risk: true
        },
        {
          name: 'Core Fixes',
          workflows: ['fix-apis', 'fix-ui'],
          auto_approve_low_risk: false
        },
        {
          name: 'Optimization',
          workflows: ['optimize'],
          auto_approve_low_risk: false
        },
        {
          name: 'Quality Assurance',
          workflows: ['validate'],
          auto_approve_low_risk: false
        }
      ]
    },
    balanced: {
      name: 'balanced',
      strategy: 'balanced',
      description: 'Balanced speed and safety',
      full_coordination: true,
      phases: [
        {
          name: 'Investigation',
          workflows: ['investigate'],
          auto_approve_low_risk: true
        },
        {
          name: 'Fixes',
          workflows: ['cleanup', 'fix-apis', 'fix-ui'],
          auto_approve_low_risk: true
        },
        {
          name: 'Optimization & QA',
          workflows: ['optimize', 'validate'],
          auto_approve_low_risk: false
        }
      ]
    },
    aggressive: {
      name: 'aggressive',
      strategy: 'aggressive',
      description: 'Fast transformation with minimal pauses',
      full_coordination: true,
      phases: [
        {
          name: 'Full Pipeline',
          workflows: ['investigate', 'cleanup', 'fix-apis', 'fix-ui', 'optimize', 'validate'],
          auto_approve_low_risk: true
        }
      ]
    }
  };

  for (const [name, pipeline] of Object.entries(pipelines)) {
    await fs.writeJSON(
      path.join(codeswarmDir, 'pipelines', `${name}.json`),
      pipeline,
      { spaces: 2 }
    );
  }
}

module.exports = { initializeProject };
