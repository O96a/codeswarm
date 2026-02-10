#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const packageJson = require('./package.json');
const { initializeProject } = require('./init');
const { listAgents } = require('./agents');
const { runAgent } = require('./run');
const { runWorkflow } = require('./workflow');
const { runPipeline } = require('./pipeline');
const { showReport } = require('./report');
const { rollback } = require('./rollback');
const { interactiveMode } = require('./interactive');
const { showStatus } = require('./status');
const { recommendAgent } = require('./recommend');

const program = new Command();

program
  .name('codeswarm')
  .description('Multi-agent AI code quality orchestration system')
  .version(packageJson.version);

// Initialize command
program
  .command('init')
  .description('Initialize CodeSwarm in the current repository')
  .option('-t, --template <type>', 'Project template (react, node, python, vue, angular)', 'node')
  .option('-m, --model <model>', 'Default Ollama model', 'qwen3-coder')
  .action(initializeProject);

// Agents command
program
  .command('agents')
  .description('Manage and list available agents')
  .option('-l, --list', 'List all available agents')
  .option('-i, --info <agent>', 'Show detailed info about an agent')
  .option('-c, --create <name>', 'Create a custom agent')
  .action(listAgents);

// Run command
program
  .command('run <agent>')
  .description('Run a specific agent')
  .option('-a, --auto-approve', 'Auto-approve changes (use with caution)')
  .option('-s, --skip-tests', 'Skip test validation')
  .option('-d, --dry-run', 'Show what would be done without making changes')
  .option('-m, --model <model>', 'Override default model for this run')
  .action(runAgent);

// Recommend command
program
  .command('recommend <task>')
  .description('Get intelligent agent recommendation for a task')
  .option('-c, --capability <type>', 'Required capability for the task')
  .action(recommendAgent);

// Workflow command
program
  .command('workflow <name>')
  .description('Run a predefined workflow')
  .option('-a, --auto-approve-low-risk', 'Auto-approve low-risk changes')
  .option('-s, --skip-tests', 'Skip test validation')
  .action(runWorkflow);

// Pipeline command
program
  .command('pipeline <strategy>')
  .description('Run full quality pipeline (cautious, balanced, aggressive)')
  .option('-a, --auto-approve', 'Auto-approve specified risk levels')
  .option('--budget <tokens>', 'Set token budget for the session')
  .action(runPipeline);

// Report command
program
  .command('report [session]')
  .description('View session reports')
  .option('-l, --last', 'Show last session report')
  .option('-a, --all', 'List all sessions')
  .option('-j, --json', 'Output as JSON')
  .action(showReport);

// Diff command
program
  .command('diff [session]')
  .description('Show diffs from a session')
  .option('-l, --last', 'Show last session diff')
  .action(async (session, options) => {
    const { showDiff } = require('./diff');
    await showDiff(session, options);
  });

// Rollback command
program
  .command('rollback [session]')
  .description('Rollback changes from a session')
  .option('-t, --to-checkpoint <checkpoint>', 'Rollback to specific checkpoint')
  .option('-f, --force', 'Force rollback without confirmation')
  .action(rollback);

// Status command
program
  .command('status')
  .description('Show current CodeSwarm status')
  .action(showStatus);

// Interactive mode
program
  .command('interactive')
  .description('Start interactive mode with step-by-step approvals')
  .action(interactiveMode);

// Coordination command
program
  .command('coordinate')
  .description('Enable agent coordination mode')
  .option('-g, --goal <description>', 'Overall goal for coordinated agents')
  .option('-a, --agents <agents...>', 'Specific agents to coordinate')
  .action(async (options) => {
    const { coordinateAgents } = require('./coordinate');
    await coordinateAgents(options);
  });

// Learning command
program
  .command('learning <action>')
  .description('Manage self-learning system (SONA)')
  .option('--history', 'Show weight adjustment history')
  .option('--patterns', 'Show learned task patterns')
  .option('--capabilities', 'Show discovered capabilities')
  .option('--format <type>', 'Export format (json)', 'json')
  .option('--capability <value>', 'Capability weight (for set action)')
  .option('--semantic <value>', 'Semantic weight (for set action)')
  .option('--success <value>', 'Success weight (for set action)')
  .action(async (action, options) => {
    const {
      showLearningDashboard,
      showLearningStats,
      manageWeights,
      exportLearningData
    } = require('./learning-dashboard');

    switch (action) {
      case 'dashboard':
        await showLearningDashboard(options);
        break;
      case 'stats':
        await showLearningStats();
        break;
      case 'weights':
        await manageWeights('show');
        break;
      case 'weights:reset':
        await manageWeights('reset');
        break;
      case 'weights:set':
        await manageWeights('set', options);
        break;
      case 'export':
        await exportLearningData(options.format);
        break;
      default:
        console.log(chalk.red(`\nUnknown learning action: ${action}\n`));
        console.log(chalk.yellow('Available actions: dashboard, stats, weights, weights:reset, weights:set, export'));
    }
  });

// Error handling
program.on('command:*', () => {
  console.error(chalk.red(`\nInvalid command: ${program.args.join(' ')}\n`));
  console.log(chalk.yellow('See --help for a list of available commands.\n'));
  process.exit(1);
});

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
