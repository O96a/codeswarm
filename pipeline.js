const fs = require('fs-extra');
const path = require('path');
const Orchestrator = require('./orchestrator');

async function runPipeline(strategy, options) {
  const configPath = path.join(process.cwd(), '.mehaisi', 'config.json');
  const config = await fs.readJSON(configPath);

  const orchestrator = new Orchestrator(config);
  await orchestrator.initialize();
  await orchestrator.runPipeline(strategy, options);
}

module.exports = { runPipeline };
