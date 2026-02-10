const fs = require('fs-extra');
const path = require('path');
const Orchestrator = require('./orchestrator');

async function runAgent(agentName, options) {
  const configPath = path.join(process.cwd(), '.mehaisi', 'config.json');
  const config = await fs.readJSON(configPath);

  const orchestrator = new Orchestrator(config);
  await orchestrator.initialize();
  await orchestrator.runAgent(agentName, options);
}

module.exports = { runAgent };
