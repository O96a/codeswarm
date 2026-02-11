const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const ui = require('./ui-formatter');

async function showStatus() {
  const mehaisiDir = path.join(process.cwd(), '.mehaisi');

  if (!await fs.pathExists(mehaisiDir)) {
    ui.error('Mehaisi CodeSwarm not initialized. Run: codeswarm init');
    return;
  }

  ui.header('Mehaisi CodeSwarm Status', 'gear');  
  const config = await fs.readJSON(path.join(mehaisiDir, 'config.json'));
  
  ui.section('Configuration');
  ui.keyValue('Model', chalk.cyan(config.model));
  ui.keyValue('Provider', chalk.cyan(config.llm?.default_provider || 'default'));
  ui.keyValue('Safety Mode', config.safety.auto_apply ? chalk.yellow('Auto-apply') : chalk.green('Manual approval'));
  
  const agentsCount = (await fs.readdir(path.join(mehaisiDir, 'agents'))).length;
  ui.keyValue('Agents', chalk.white(agentsCount));
  
  const sessionsDir = path.join(mehaisiDir, 'sessions');
  if (await fs.pathExists(sessionsDir)) {
    const sessions = await fs.readdir(sessionsDir);
    ui.keyValue('Sessions', chalk.white(sessions.length));
  }
  
  ui.spacer();
}

module.exports = { showStatus };
