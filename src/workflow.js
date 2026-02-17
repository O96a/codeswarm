const fs = require('fs-extra');
const path = require('path');
const Orchestrator = require('./orchestrator');

async function runWorkflow(workflowName, options) {
  const configPath = path.join(process.cwd(), '.mehaisi', 'config.json');
  const config = await fs.readJSON(configPath);

  const orchestrator = new Orchestrator(config);
  await orchestrator.initialize();
  await orchestrator.runWorkflow(workflowName, options);
}

module.exports = { runWorkflow };
