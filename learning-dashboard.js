const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const SONALearner = require('./sona-learner');

/**
 * Display learning dashboard showing routing improvements
 */
async function showLearningDashboard(options = {}) {
  const mehaisiDir = path.join(process.cwd(), '.mehaisi');
  
  if (!await fs.pathExists(mehaisiDir)) {
    console.log(chalk.red('✗ Mehaisi not initialized in this directory'));
    console.log(chalk.gray('  Run `mehaisi init` first'));
    return;
  }

  const learner = new SONALearner(mehaisiDir);
  await learner.initialize();

  const stats = await learner.getStatistics();

  console.log(chalk.blue.bold('\n🧠 SONA Learning Dashboard\n'));

  // Sessions & Data Collection
  console.log(chalk.cyan('📊 Data Collection'));
  console.log(chalk.gray('─'.repeat(60)));
  console.log(`  Sessions Analyzed:     ${stats.sessionsAnalyzed}`);
  console.log(`  Routing Decisions:     ${stats.routingDecisions}`);
  console.log(`  Successful Routes:     ${chalk.green(stats.successfulRoutes)}`);
  console.log(`  Failed Routes:         ${chalk.red(stats.failedRoutes)}`);
  console.log(`  Overall Accuracy:      ${formatAccuracy(stats.overallAccuracy)}`);
  console.log();

  // Learning Status
  console.log(chalk.cyan('🎯 Learning Status'));
  console.log(chalk.gray('─'.repeat(60)));
  
  if (stats.readyForOptimization) {
    console.log(chalk.green('  ✓ Ready for weight optimization'));
  } else {
    const needed = learner.config.minSessionsForLearning - stats.sessionsAnalyzed;
    console.log(chalk.yellow(`  ⏳ Need ${needed} more session(s) for optimization`));
  }
  
  console.log(`  Weight Adjustments:    ${stats.weightAdjustments}`);
  console.log(`  Discovered Capabilities: ${stats.discoveredCapabilities}`);
  console.log(`  Learned Patterns:      ${stats.taskPatterns}`);
  console.log();

  // Current Routing Weights
  console.log(chalk.cyan('⚖️  Current Routing Weights'));
  console.log(chalk.gray('─'.repeat(60)));
  const w = stats.currentWeights;
  console.log(`  Capability Matching:   ${formatWeight(w.capability)}`);
  console.log(`  Semantic Similarity:   ${formatWeight(w.semantic)}`);
  console.log(`  Historical Success:    ${formatWeight(w.success)}`);
  console.log();

  // Top Performing Agents
  if (stats.topPerformingAgents && stats.topPerformingAgents.length > 0) {
    console.log(chalk.cyan('🏆 Top Performing Agents'));
    console.log(chalk.gray('─'.repeat(60)));
    
    for (const agent of stats.topPerformingAgents) {
      const successRate = formatAccuracy(agent.successRate);
      const bar = createProgressBar(agent.successRate, 20);
      console.log(`  ${agent.name.padEnd(25)} ${successRate} ${bar} (${agent.executions} runs)`);
    }
    console.log();
  }

  // Weight History
  if (options.history && learner.learningData.weightsHistory.length > 0) {
    console.log(chalk.cyan('📈 Weight Adjustment History'));
    console.log(chalk.gray('─'.repeat(60)));
    
    for (const entry of learner.learningData.weightsHistory.slice(-5)) {
      const date = new Date(entry.timestamp).toISOString().split('T')[0];
      const improvement = entry.accuracy > entry.previousAccuracy ? 
        chalk.green(`+${((entry.accuracy - entry.previousAccuracy) * 100).toFixed(1)}%`) :
        chalk.red(`${((entry.accuracy - entry.previousAccuracy) * 100).toFixed(1)}%`);
      
      console.log(`  ${date}: Accuracy ${formatAccuracy(entry.previousAccuracy)} → ${formatAccuracy(entry.accuracy)} ${improvement}`);
      console.log(chalk.gray(`    Weights: cap=${entry.weights.capability.toFixed(2)}, sem=${entry.weights.semantic.toFixed(2)}, suc=${entry.weights.success.toFixed(2)}`));
    }
    console.log();
  }

  // Task Patterns
  if (options.patterns && learner.learningData.taskPatterns.length > 0) {
    console.log(chalk.cyan('🎯 Learned Task Patterns'));
    console.log(chalk.gray('─'.repeat(60)));
    
    for (const pattern of learner.learningData.taskPatterns.slice(0, 10)) {
      const successRate = formatAccuracy(pattern.successRate);
      console.log(`  ${pattern.taskType.padEnd(30)} → ${pattern.agentName.padEnd(20)} ${successRate}`);
    }
    console.log();
  }

  // Discovered Capabilities
  if (options.capabilities && Object.keys(learner.learningData.discoveredCapabilities).length > 0) {
    console.log(chalk.cyan('💡 Discovered Agent Capabilities'));
    console.log(chalk.gray('─'.repeat(60)));
    
    for (const [agentId, capabilities] of Object.entries(learner.learningData.discoveredCapabilities)) {
      if (capabilities.length > 0) {
        console.log(`  ${agentId}:`);
        for (const cap of capabilities) {
          console.log(`    • ${cap.capability.padEnd(25)} (${formatAccuracy(cap.successRate)}, ${cap.count} successes)`);
        }
      }
    }
    console.log();
  }

  // Action Items
  console.log(chalk.cyan('💡 Recommendations'));
  console.log(chalk.gray('─'.repeat(60)));
  
  if (stats.readyForOptimization && stats.weightAdjustments === 0) {
    console.log(chalk.yellow('  → Run more sessions to enable automatic weight optimization'));
  } else if (stats.readyForOptimization) {
    console.log(chalk.green('  → Learning is active and optimizing routing decisions'));
  } else {
    const needed = learner.config.minSessionsForLearning - stats.sessionsAnalyzed;
    console.log(chalk.yellow(`  → Run ${needed} more session(s) to enable learning`));
  }

  if (stats.overallAccuracy < 0.7 && stats.routingDecisions > 10) {
    console.log(chalk.yellow('  → Routing accuracy is below 70% - consider adjusting agent capabilities'));
  } else if (stats.overallAccuracy >= 0.9) {
    console.log(chalk.green('  → Excellent routing accuracy! System is learning well'));
  }

  console.log();
}

/**
 * Show quick learning stats
 */
async function showLearningStats() {
  const mehaisiDir = path.join(process.cwd(), '.mehaisi');
  
  if (!await fs.pathExists(mehaisiDir)) {
    console.log(chalk.red('✗ Mehaisi not initialized'));
    return;
  }

  const learner = new SONALearner(mehaisiDir);
  await learner.initialize();
  const stats = await learner.getStatistics();

  console.log(chalk.blue('\n🧠 Learning Stats\n'));
  console.log(`  Sessions: ${stats.sessionsAnalyzed}`);
  console.log(`  Routing Accuracy: ${formatAccuracy(stats.overallAccuracy)}`);
  console.log(`  Weight Adjustments: ${stats.weightAdjustments}`);
  console.log(`  Discovered Capabilities: ${stats.discoveredCapabilities}`);
  console.log();
}

/**
 * Show/update routing weights
 */
async function manageWeights(action, options = {}) {
  const mehaisiDir = path.join(process.cwd(), '.mehaisi');
  
  if (!await fs.pathExists(mehaisiDir)) {
    console.log(chalk.red('✗ Mehaisi not initialized'));
    return;
  }

  const learner = new SONALearner(mehaisiDir);
  await learner.initialize();

  if (action === 'show') {
    const w = learner.routingWeights;
    console.log(chalk.blue('\n⚖️  Current Routing Weights\n'));
    console.log(`  Capability Matching:   ${formatWeight(w.capability)}`);
    console.log(`  Semantic Similarity:   ${formatWeight(w.semantic)}`);
    console.log(`  Historical Success:    ${formatWeight(w.success)}`);
    console.log();
  } else if (action === 'reset') {
    learner.routingWeights = { capability: 0.4, semantic: 0.4, success: 0.2 };
    await learner.saveRoutingWeights();
    console.log(chalk.green('\n✓ Routing weights reset to defaults\n'));
  } else if (action === 'set' && options.capability && options.semantic && options.success) {
    const sum = parseFloat(options.capability) + parseFloat(options.semantic) + parseFloat(options.success);
    
    if (Math.abs(sum - 1.0) > 0.01) {
      console.log(chalk.red('\n✗ Weights must sum to 1.0\n'));
      return;
    }

    learner.routingWeights = {
      capability: parseFloat(options.capability),
      semantic: parseFloat(options.semantic),
      success: parseFloat(options.success)
    };
    
    await learner.saveRoutingWeights();
    console.log(chalk.green('\n✓ Routing weights updated\n'));
  }
}

/**
 * Export learning data
 */
async function exportLearningData(format = 'json') {
  const mehaisiDir = path.join(process.cwd(), '.mehaisi');
  
  if (!await fs.pathExists(mehaisiDir)) {
    console.log(chalk.red('✗ Mehaisi not initialized'));
    return;
  }

  const learner = new SONALearner(mehaisiDir);
  await learner.initialize();

  const data = {
    statistics: await learner.getStatistics(),
    routingOutcomes: learner.learningData.routingOutcomes,
    agentPerformance: learner.learningData.agentPerformance,
    discoveredCapabilities: learner.learningData.discoveredCapabilities,
    taskPatterns: learner.learningData.taskPatterns,
    weightsHistory: learner.learningData.weightsHistory,
    currentWeights: learner.routingWeights
  };

  if (format === 'json') {
    console.log(JSON.stringify(data, null, 2));
  } else {
    // Future: CSV, Markdown, etc.
    console.log(JSON.stringify(data, null, 2));
  }
}

// Utility functions

function formatAccuracy(accuracy) {
  const percent = (accuracy * 100).toFixed(1);
  if (accuracy >= 0.9) return chalk.green(`${percent}%`);
  if (accuracy >= 0.7) return chalk.yellow(`${percent}%`);
  return chalk.red(`${percent}%`);
}

function formatWeight(weight) {
  const percent = (weight * 100).toFixed(0);
  return chalk.gray(`${percent}%`);
}

function createProgressBar(value, width = 20) {
  const filled = Math.round(value * width);
  const empty = width - filled;
  return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
}

module.exports = {
  showLearningDashboard,
  showLearningStats,
  manageWeights,
  exportLearningData
};
