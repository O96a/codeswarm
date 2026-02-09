const chalk = require('chalk');
const Orchestrator = require('../orchestrator');
const fs = require('fs-extra');
const path = require('path');

async function coordinateAgents(options) {
  console.log(chalk.blue.bold('\n🤝 Agent Coordination Mode\n'));
  
  const configPath = path.join(process.cwd(), '.codeswarm', 'config.json');
  const config = await fs.readJSON(configPath);

  const orchestrator = new Orchestrator(config);
  await orchestrator.initialize();

  console.log(chalk.cyan(`Goal: ${options.goal || 'General code quality improvement'}\n`));
  
  // Enable full coordination across all agents
  console.log(chalk.white('Agents will coordinate to achieve the goal...\n'));
  
  // Run investigation phase with coordination
  await orchestrator.runWorkflow('investigate', { ...options, coordination: true });
  
  // Show coordination summary
  await orchestrator.coordinationHub.generateCoordinationSummary();
}

module.exports = { coordinateAgents };
