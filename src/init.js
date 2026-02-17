const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const ui = require('./ui-formatter');

async function initializeProject(options) {
  ui.header('Initializing Mehaisi CodeSwarm', 'rocket');

  const cwd = process.cwd();
  const mehaisiDir = path.join(cwd, '.mehaisi');

  // Check if already initialized
  if (await fs.pathExists(mehaisiDir)) {
    const { reinit } = await inquirer.prompt([{
      type: 'confirm',
      name: 'reinit',
      message: 'Mehaisi CodeSwarm already initialized. Reinitialize?',
      default: false
    }]);
    if (!reinit) return;
  }

  const spinner = ora('Creating directory structure...').start();

  try {
    // Create directory structure
    await fs.ensureDir(path.join(mehaisiDir, 'agents'));
    await fs.ensureDir(path.join(mehaisiDir, 'workflows'));
    await fs.ensureDir(path.join(mehaisiDir, 'pipelines'));
    await fs.ensureDir(path.join(mehaisiDir, 'sessions'));
    await fs.ensureDir(path.join(mehaisiDir, 'reports'));

    // Copy agent templates from templates directory
    const templatesDir = path.join(__dirname, '..', 'templates', 'agents');
    const files = await fs.readdir(templatesDir);
    const agentFiles = files.filter(file => file.endsWith('.yml'));

    for (const file of agentFiles) {
      await fs.copy(path.join(templatesDir, file), path.join(mehaisiDir, 'agents', file));
    }

    // Create default config with LLM provider abstraction
    const selectedModel = options.model || 'kimi-k2.5:cloud';
    
    // Determine default provider based on selected model
    // This uses intelligent pattern matching to select the appropriate provider
    let defaultProvider;
    if (selectedModel.includes(':cloud')) {
      defaultProvider = 'ollama-cloud';
    } else if (selectedModel.includes(':local') || (!selectedModel.includes('claude') && !selectedModel.includes(':'))) {
      defaultProvider = 'ollama-local';
    } else {
      defaultProvider = 'claude-code';
    }
    
    /**
     * MODEL SELECTION PRIORITY (enforced by ModelResolver):
     * 
     * 1. Runtime override:  mehaisi run agent --model <model>
     * 2. Global config:     Set during 'mehaisi init --model <model>' (this value)
     * 3. Agent default:     Defined in agent YAML file (usually commented out)
     * 4. Provider default:  From provider configuration
     * 
     * This ensures your chosen model is used across all agents unless
     * explicitly overridden at runtime or in specific agent configs.
     */
    const config = {
      model: selectedModel,
      ollama_url: 'https://api.ollama.com',  // Ollama Cloud by default
      llm: {
        default_provider: defaultProvider,
        providers: {
          'ollama-cloud': {
            type: 'ollama',
            url: 'https://api.ollama.com',
            model: selectedModel.includes(':cloud') ? selectedModel : 'kimi-k2.5:cloud',
            priority: 1,
            // Set OLLAMA_CLOUD_API_KEY environment variable for authentication
          },
          'ollama-local': {
            type: 'ollama',
            url: 'http://localhost:11434',
            model: selectedModel.replace(':cloud', '').replace(':local', ''),
            priority: 2,
            fallback: true,
            // Requires Ollama running locally: ollama serve
          },
          'claude-code': {
            type: 'claude-cli',
            model: selectedModel,
            timeout: 600000,
            // Requires CLAUDE_CODE_SESSION_ACCESS_TOKEN for authentication
          }
        }
      },
      safety: {
        auto_apply: false,
        require_tests: true,
        max_files_per_agent: 10,
        token_budget_per_agent: 50000,
        rollback_on_failure: true
      },
      execution: {
        parallel_agents: 3,          // Max 3 parallel Claude instances (hard limit)
        max_claude_instances: 3,     // Hard limit, cannot be exceeded
        instance_timeout: 600000,    // 10 min timeout
        batch_cooldown: 2000,        // 2 sec cooldown between batches
        max_retries: 2,             // Max 2 retries per agent
        session_timeout: 3600000,    // 1 hour max session
        pause_on_error: true,
        auto_commit: false
      },
      coordination: {
        enabled: true,
        learning: {
          enabled: true,                      // Enable SONA self-learning
          capture_file_operations: true,      // Capture file edits for learning
          capture_commands: true,             // Capture command execution
          capture_coordination: true,         // Capture agent coordination events
          min_sessions_for_learning: 5,       // Minimum sessions before weight optimization
          auto_adjust_weights: true,          // Automatically optimize routing weights
          min_success_count_for_capability: 3, // Minimum successes to discover capability
          confidence_threshold: 0.7,          // Confidence threshold for patterns
          max_weight_shift: 0.1               // Maximum weight change per optimization (10%)
        }
      },
      project_context: {
        type: options.template || 'node',
        test_command: 'npm test',
        build_command: 'npm run build',
        ignored_paths: ['node_modules', 'dist', '.git', 'build', 'coverage']
      }
    };

    await fs.writeJSON(path.join(mehaisiDir, 'config.json'), config, { spaces: 2 });

    // Create default workflows
    await createDefaultWorkflows(mehaisiDir);

    // Create default pipelines
    await createDefaultPipelines(mehaisiDir);

    // Create .gitignore entry
    const gitignorePath = path.join(cwd, '.gitignore');
    if (await fs.pathExists(gitignorePath)) {
      let gitignore = await fs.readFile(gitignorePath, 'utf8');
      if (!gitignore.includes('.mehaisi/sessions')) {
        gitignore += '\n\n# Mehaisi\n.mehaisi/sessions/\n.mehaisi/reports/\n';
        await fs.writeFile(gitignorePath, gitignore);
      }
    }

    spinner.succeed('Initialization complete');

    ui.section('Mehaisi CodeSwarm Configuration');
    ui.item(`${chalk.bold('19')} agents configured`, 0);
    ui.item(`Workflows & pipelines ready`, 0);
    ui.item(`Model: ${chalk.cyan(selectedModel)}`, 0);
    ui.item(`Provider: ${chalk.cyan(defaultProvider)}`, 0);

    ui.nextSteps('Get Started', [
      `${chalk.cyan('codeswarm credentials')} ${chalk.gray('· Setup API keys')}`,
      `${chalk.cyan('codeswarm agents --list')} ${chalk.gray('· View available agents')}`,
      `${chalk.cyan('codeswarm pipeline cautious')} ${chalk.gray('· Run full pipeline')}`
    ]);

  } catch (error) {
    spinner.fail('Initialization failed');
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

async function createDefaultWorkflows(mehaisiDir) {
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
      path.join(mehaisiDir, 'workflows', `${name}.json`),
      workflow,
      { spaces: 2 }
    );
  }
}

async function createDefaultPipelines(mehaisiDir) {
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
      path.join(mehaisiDir, 'pipelines', `${name}.json`),
      pipeline,
      { spaces: 2 }
    );
  }
}

module.exports = { initializeProject };
