/**
 * Config Manager
 * 
 * Manages Mehaisi configuration through CLI
 */

const fs = require('fs-extra');
const path = require('path');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ui = require('./ui-formatter');

async function configureSettings(options) {
  const configPath = path.join(process.cwd(), '.mehaisi', 'config.json');
  
  if (!await fs.pathExists(configPath)) {
    ui.error('Mehaisi not initialized. Run: mehaisi init');
    return;
  }

  const config = await fs.readJSON(configPath);

  if (options.list) {
    displayConfig(config);
    return;
  }

  if (options.interactive) {
    await interactiveConfig(config, configPath);
    return;
  }

  // Handle specific flag-based changes
  let changed = false;

  if (options.autoApply !== undefined) {
    config.safety.auto_apply = options.autoApply;
    changed = true;
  }

  if (options.requireTests !== undefined) {
    config.safety.require_tests = options.requireTests;
    changed = true;
  }

  if (options.rollbackOnFailure !== undefined) {
    config.safety.rollback_on_failure = options.rollbackOnFailure;
    changed = true;
  }

  if (options.model) {
    config.model = options.model;
    changed = true;
  }

  if (options.provider) {
    config.llm.default_provider = options.provider;
    changed = true;
  }

  if (changed) {
    await fs.writeJSON(configPath, config, { spaces: 2 });
    ui.success('Configuration updated');
    displayConfig(config);
  } else {
    // No options provided, show interactive mode
    await interactiveConfig(config, configPath);
  }
}

function displayConfig(config) {
  ui.header('Current Configuration', 'gear');

  ui.section('Model & Provider');
  ui.keyValue('Model', chalk.cyan(config.model));
  ui.keyValue('Default Provider', chalk.cyan(config.llm?.default_provider || 'not set'));

  ui.section('Safety Settings');
  ui.keyValue('Auto-apply Changes', config.safety.auto_apply ? chalk.yellow('Enabled') : chalk.green('Disabled (Manual approval)'));
  ui.keyValue('Require Tests', config.safety.require_tests ? chalk.green('Yes') : chalk.yellow('No'));
  ui.keyValue('Rollback on Failure', config.safety.rollback_on_failure ? chalk.green('Yes') : chalk.yellow('No'));
  ui.keyValue('Max Files per Agent', chalk.white(config.safety.max_files_per_agent));
  ui.keyValue('Token Budget per Agent', chalk.white(config.safety.token_budget_per_agent));

  ui.section('Execution Settings');
  ui.keyValue('Parallel Agents', chalk.white(config.execution.parallel_agents));
  ui.keyValue('Max Retries', chalk.white(config.execution.max_retries));
  ui.keyValue('Session Timeout', chalk.white(`${config.execution.session_timeout / 1000}s`));
  ui.keyValue('Pause on Error', config.execution.pause_on_error ? chalk.green('Yes') : chalk.yellow('No'));
  ui.keyValue('Auto Commit', config.execution.auto_commit ? chalk.yellow('Yes') : chalk.green('No'));

  ui.spacer();
}

async function interactiveConfig(config, configPath) {
  ui.header('Interactive Configuration', 'gear');

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'category',
      message: 'What would you like to configure?',
      choices: [
        { name: 'Safety Settings', value: 'safety' },
        { name: 'Model & Provider', value: 'model' },
        { name: 'Execution Settings', value: 'execution' },
        { name: 'View All Settings', value: 'view' },
        { name: 'Cancel', value: 'cancel' }
      ]
    }
  ]);

  if (answers.category === 'cancel') {
    ui.info('Configuration cancelled');
    return;
  }

  if (answers.category === 'view') {
    displayConfig(config);
    return;
  }

  if (answers.category === 'safety') {
    await configureSafety(config, configPath);
  } else if (answers.category === 'model') {
    await configureModel(config, configPath);
  } else if (answers.category === 'execution') {
    await configureExecution(config, configPath);
  }
}

async function configureSafety(config, configPath) {
  ui.section('Safety Settings');

  const answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'auto_apply',
      message: 'Auto-apply changes without confirmation?',
      default: config.safety.auto_apply,
      suffix: chalk.gray(' (⚠ Recommended: No)')
    },
    {
      type: 'confirm',
      name: 'require_tests',
      message: 'Require tests to pass before applying changes?',
      default: config.safety.require_tests,
      suffix: chalk.gray(' (✓ Recommended: Yes)')
    },
    {
      type: 'confirm',
      name: 'rollback_on_failure',
      message: 'Automatically rollback on agent failure?',
      default: config.safety.rollback_on_failure,
      suffix: chalk.gray(' (✓ Recommended: Yes)')
    },
    {
      type: 'number',
      name: 'max_files_per_agent',
      message: 'Maximum files per agent:',
      default: config.safety.max_files_per_agent,
      validate: (input) => input > 0 ? true : 'Must be greater than 0'
    },
    {
      type: 'number',
      name: 'token_budget_per_agent',
      message: 'Token budget per agent:',
      default: config.safety.token_budget_per_agent,
      validate: (input) => input > 0 ? true : 'Must be greater than 0'
    }
  ]);

  config.safety = { ...config.safety, ...answers };
  await fs.writeJSON(configPath, config, { spaces: 2 });

  ui.success('Safety settings updated');
  displayConfig(config);
}

async function configureModel(config, configPath) {
  ui.section('Model & Provider Settings');

  const providers = Object.keys(config.llm?.providers || {});

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'model',
      message: 'Model name:',
      default: config.model,
      suffix: chalk.gray(' (e.g., kimi-k2.5:cloud, qwen3-coder:local)')
    },
    {
      type: 'list',
      name: 'provider',
      message: 'Default provider:',
      choices: providers,
      default: config.llm?.default_provider
    }
  ]);

  config.model = answers.model;
  config.llm.default_provider = answers.provider;

  await fs.writeJSON(configPath, config, { spaces: 2 });

  ui.success('Model settings updated');
  displayConfig(config);
}

async function configureExecution(config, configPath) {
  ui.section('Execution Settings');

  const answers = await inquirer.prompt([
    {
      type: 'number',
      name: 'parallel_agents',
      message: 'Maximum parallel agents (1-3):',
      default: config.execution.parallel_agents,
      validate: (input) => (input >= 1 && input <= 3) ? true : 'Must be between 1 and 3'
    },
    {
      type: 'number',
      name: 'max_retries',
      message: 'Maximum retries per agent:',
      default: config.execution.max_retries,
      validate: (input) => input >= 0 ? true : 'Must be 0 or greater'
    },
    {
      type: 'confirm',
      name: 'pause_on_error',
      message: 'Pause pipeline on error?',
      default: config.execution.pause_on_error
    },
    {
      type: 'confirm',
      name: 'auto_commit',
      message: 'Auto-commit changes?',
      default: config.execution.auto_commit,
      suffix: chalk.gray(' (⚠ Recommended: No)')
    }
  ]);

  config.execution = { ...config.execution, ...answers };
  await fs.writeJSON(configPath, config, { spaces: 2 });

  ui.success('Execution settings updated');
  displayConfig(config);
}

module.exports = { configureSettings };
