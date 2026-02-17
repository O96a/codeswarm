const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const CoordinationHub = require('./coordination-hub');
const { v4: uuidv4 } = require('uuid');
const yaml = require('yaml');

/**
 * Recommend the best agent for a given task using intelligent routing
 */
async function recommendAgent(taskDescription, options = {}) {
  const mehaisiDir = path.join(process.cwd(), '.mehaisi');
  
      if (!await fs.pathExists(mehaisiDir)) {
      console.log(chalk.red('\n✗ Mehaisi CodeSwarm not initialized. Run: codeswarm init\n'));
      return;
    }
  
    // Load config
    const configPath = path.join(mehaisiDir, 'config.json');
    let config = {};
    if (await fs.pathExists(configPath)) {
      config = await fs.readJSON(configPath);
    }
  
    // Create a temporary session for routing
    const sessionId = uuidv4();
    const sessionDir = path.join(mehaisiDir, 'sessions', sessionId);
    await fs.ensureDir(sessionDir);
  
    try {
      // Initialize coordination hub
      const hub = new CoordinationHub(sessionDir, config);
      await hub.initialize();
  
      // Load and register all available agents
      const agentsDir = path.join(mehaisiDir, 'agents');
      const agentFiles = await fs.readdir(agentsDir);
  
      for (const file of agentFiles) {
        if (file.endsWith('.yml')) {
          const content = await fs.readFile(path.join(agentsDir, file), 'utf8');
          const agentConfig = yaml.parse(content);
          
          // Register agent with coordination hub
          const agentId = uuidv4();
          await hub.registerAgent(agentId, {
            name: agentConfig.name,
            type: agentConfig.type,
            coordination: agentConfig.coordination || {}
          });
        }
      }
  
      // Get routing recommendation
      console.log(chalk.blue.bold('\n🧠 Intelligent Agent Routing\n'));
      console.log(chalk.white(`Task: ${taskDescription}\n`));
  
      const routing = await hub.recommendAgentForTask({
        name: 'User Task',
        description: taskDescription,
        requiredCapability: options.capability
      });
  
      if (routing.agent) {
        console.log(chalk.green.bold('✓ Recommended Agent:\n'));
        console.log(chalk.white(`  Agent: ${routing.agent.name}`));
        console.log(chalk.white(`  Type: ${routing.agent.type}`));
        console.log(chalk.white(`  Confidence: ${(routing.confidence * 100).toFixed(0)}%`));
        console.log(chalk.white(`  Reason: ${routing.reason}`));
        
        if (routing.alternatives && routing.alternatives.length > 0) {
          console.log(chalk.cyan('\n📋 Alternative Agents:'));
          routing.alternatives.forEach((alt, i) => {
            console.log(chalk.gray(`  ${i + 1}. ${alt.name} (${(alt.confidence * 100).toFixed(0)}%)`));
          });
        }
        
        console.log(chalk.gray('\n💡 To run this agent:'));
        console.log(chalk.white(`   codeswarm run ${routing.agent.name.toLowerCase().replace(/\s+/g, '-')}\n`));
      } else {      console.log(chalk.yellow.bold('⚠ No suitable agent found\n'));
      console.log(chalk.white(`  Confidence: ${(routing.confidence * 100).toFixed(0)}%`));
      console.log(chalk.white(`  Reason: ${routing.reason}`));
      
      if (routing.alternatives && routing.alternatives.length > 0) {
        console.log(chalk.cyan('\n📋 Available Agents (by capability):'));
        routing.alternatives.forEach((alt, i) => {
          console.log(chalk.gray(`  ${i + 1}. ${alt.name} (${(alt.confidence * 100).toFixed(0)}%)`));
        });
      }
      console.log();
    }

  } finally {
    // Clean up temporary session
    await fs.remove(sessionDir);
  }
}

module.exports = { recommendAgent };
