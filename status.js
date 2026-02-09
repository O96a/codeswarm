const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

async function showStatus() {
  const codeswarmDir = path.join(process.cwd(), '.codeswarm');
  
  if (!await fs.pathExists(codeswarmDir)) {
    console.log(chalk.red('\n✗ Not initialized\n'));
    return;
  }

  console.log(chalk.blue.bold('\n📊 CodeSwarm Status:\n'));
  
  const config = await fs.readJSON(path.join(codeswarmDir, 'config.json'));
  console.log(chalk.white(`Model: ${config.model}`));
  console.log(chalk.white(`Safety: ${config.safety.auto_apply ? 'Auto-apply' : 'Manual approval'}`));
  
  const agentsCount = (await fs.readdir(path.join(codeswarmDir, 'agents'))).length;
  console.log(chalk.white(`Agents: ${agentsCount}`));
  
  const sessionsDir = path.join(codeswarmDir, 'sessions');
  if (await fs.pathExists(sessionsDir)) {
    const sessions = await fs.readdir(sessionsDir);
    console.log(chalk.white(`Sessions: ${sessions.length}\n`));
  }
}

module.exports = { showStatus };
