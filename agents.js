const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const Table = require('cli-table3');
const yaml = require('yaml');
const ui = require('./ui-formatter');

async function listAgents(options) {
  const agentsDir = path.join(process.cwd(), '.mehaisi', 'agents');
  
  if (!await fs.pathExists(agentsDir)) {
    ui.error('Mehaisi CodeSwarm not initialized. Run: codeswarm init');
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

  ui.header('Available Agents', 'gear');

  for (const [type, agentList] of Object.entries(byType)) {
    console.log(chalk.cyan.bold(`\n${type.toUpperCase()}`));
    
    const table = new Table({
      head: ['Agent', 'Risk', 'Capabilities'],
      style: { head: ['cyan'], border: ['gray'] },
      chars: {
        'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
        'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
        'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
        'right': '│', 'right-mid': '┤', 'middle': '│'
      }
    });

    for (const agent of agentList) {
      const riskColor = agent.risk_level === 'low' ? chalk.green : 
                       agent.risk_level === 'medium' ? chalk.yellow : chalk.red;
      table.push([
        agent.name,
        riskColor(agent.risk_level),
        (agent.coordination?.capabilities?.slice(0, 2).join(', ') || 'none')
      ]);
    }

    console.log(table.toString());
  }

  console.log(chalk.gray(`\n────────────────────────────`));
  console.log(`Total: ${chalk.white(agents.length)} agents configured\n`);
}

module.exports = { listAgents };
