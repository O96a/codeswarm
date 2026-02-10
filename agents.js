const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const Table = require('cli-table3');
const yaml = require('yaml');

async function listAgents(options) {
  const agentsDir = path.join(process.cwd(), '.mehaisi', 'agents');
  
  if (!await fs.pathExists(agentsDir)) {
    console.log(chalk.red('\n✗ CodeSwarm not initialized. Run: mehaisi init\n'));
    return;
  }

  const agentFiles = await fs.readdir(agentsDir);
  const agents = [];

  for (const file of agentFiles) {
    if (file.endsWith('.yml')) {
      const content = await fs.readFile(path.join(agentsDir, file), 'utf8');
      const agent = yaml.parse(content);
      agents.push({ file, ...agent });
    }
  }

  // Group by type
  const byType = agents.reduce((acc, agent) => {
    if (!acc[agent.type]) acc[agent.type] = [];
    acc[agent.type].push(agent);
    return acc;
  }, {});

  console.log(chalk.blue.bold('\n📋 Available Agents:\n'));

  for (const [type, agentList] of Object.entries(byType)) {
    console.log(chalk.cyan(`\n${type.toUpperCase()}:`));
    
    const table = new Table({
      head: ['Name', 'Risk', 'Capabilities', 'Coordinates With'],
      style: { head: ['cyan'] }
    });

    for (const agent of agentList) {
      table.push([
        agent.name,
        agent.risk_level,
        agent.coordination?.capabilities?.join(', ') || 'none',
        agent.coordination?.shares_with?.join(', ') || 'none'
      ]);
    }

    console.log(table.toString());
  }

  console.log(chalk.gray(`\nTotal: ${agents.length} agents\n`));
}

module.exports = { listAgents };
