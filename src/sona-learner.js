const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

/**
 * SONA Learner - Self-Optimizing Neural-inspired Agent router
 * 
 * Analyzes captured interaction data to improve routing decisions:
 * - Tracks agent success rates by task type
 * - Discovers agent capabilities from outcomes
 * - Optimizes routing weight parameters
 * - Learns task→agent patterns
 * 
 * SONA = Self-Optimizing Neural-inspired Agent router
 */
class SONALearner {
  constructor(mehaisiDir, config = {}) {
    this.mehaisiDir = mehaisiDir;
    this.learningDir = path.join(mehaisiDir, 'learning');
    this.sessionsDir = path.join(mehaisiDir, 'sessions');
    
    this.config = {
      minSessionsForLearning: config.min_sessions_for_learning || 5,
      minSuccessCountForCapability: config.min_success_count_for_capability || 3,
      maxWeightShift: config.max_weight_shift || 0.1, // Max 10% shift per adjustment
      confidenceThreshold: config.confidence_threshold || 0.7,
      autoAdjustWeights: config.auto_adjust_weights !== false,
      ...config
    };

    // Current routing weights (will be learned/adjusted)
    this.routingWeights = {
      capability: 0.4,
      semantic: 0.4,
      success: 0.2
    };

    // Learning data cache
    this.learningData = {
      routingOutcomes: [],        // { task, agent, confidence, success, timestamp }
      agentPerformance: {},       // { agentId: { successes, failures, byTaskType: {} } }
      discoveredCapabilities: {}, // { agentId: [capabilities] }
      taskPatterns: [],           // { pattern, agent, successRate }
      weightsHistory: []          // { timestamp, weights, accuracy }
    };

    this.initialized = false;
  }

  /**
   * Initialize learner and load existing data
   */
  async initialize() {
    await fs.ensureDir(this.learningDir);

    // Load existing learning data
    await this.loadLearningData();

    // Load current routing weights
    await this.loadRoutingWeights();

    this.initialized = true;
  }

  /**
   * Load learning data from disk
   */
  async loadLearningData() {
    const files = {
      routingOutcomes: path.join(this.learningDir, 'routing-outcomes.json'),
      agentPerformance: path.join(this.learningDir, 'agent-performance.json'),
      discoveredCapabilities: path.join(this.learningDir, 'discovered-capabilities.json'),
      taskPatterns: path.join(this.learningDir, 'task-patterns.json'),
      weightsHistory: path.join(this.learningDir, 'weights-history.json')
    };

    for (const [key, filePath] of Object.entries(files)) {
      if (await fs.pathExists(filePath)) {
        try {
          this.learningData[key] = await fs.readJSON(filePath);
        } catch (error) {
          console.warn(chalk.yellow(`⚠ Failed to load ${key}: ${error.message}`));
          this.learningData[key] = key === 'routingOutcomes' || key === 'taskPatterns' || key === 'weightsHistory' ? [] : {};
        }
      }
    }
  }

  /**
   * Save learning data to disk
   */
  async saveLearningData() {
    const files = {
      routingOutcomes: path.join(this.learningDir, 'routing-outcomes.json'),
      agentPerformance: path.join(this.learningDir, 'agent-performance.json'),
      discoveredCapabilities: path.join(this.learningDir, 'discovered-capabilities.json'),
      taskPatterns: path.join(this.learningDir, 'task-patterns.json'),
      weightsHistory: path.join(this.learningDir, 'weights-history.json')
    };

    for (const [key, filePath] of Object.entries(files)) {
      try {
        await fs.writeJSON(filePath, this.learningData[key], { spaces: 2 });
      } catch (error) {
        console.error(chalk.red(`✗ Failed to save ${key}: ${error.message}`));
      }
    }
  }

  /**
   * Load routing weights
   */
  async loadRoutingWeights() {
    const weightsPath = path.join(this.learningDir, 'routing-weights.json');
    
    if (await fs.pathExists(weightsPath)) {
      try {
        const saved = await fs.readJSON(weightsPath);
        this.routingWeights = saved.weights || this.routingWeights;
      } catch (error) {
        console.warn(chalk.yellow(`⚠ Failed to load routing weights: ${error.message}`));
      }
    }
  }

  /**
   * Save routing weights
   */
  async saveRoutingWeights() {
    const weightsPath = path.join(this.learningDir, 'routing-weights.json');
    
    await fs.writeJSON(weightsPath, {
      weights: this.routingWeights,
      lastUpdated: Date.now(),
      version: '1.0'
    }, { spaces: 2 });
  }

  /**
   * Record a routing outcome
   * @param {Object} outcome - { task, agent, confidence, success, duration, taskType }
   */
  async recordRoutingOutcome(outcome) {
    const record = {
      timestamp: Date.now(),
      taskHash: this.hashString(outcome.task || ''),
      task: this.truncateString(outcome.task, 200),
      taskType: outcome.taskType,
      agentId: outcome.agent?.id || outcome.agentId,
      agentName: outcome.agent?.name || outcome.agentName,
      confidence: outcome.confidence,
      success: outcome.success,
      duration: outcome.duration
    };

    this.learningData.routingOutcomes.push(record);

    // Update agent performance stats
    this.updateAgentPerformance(record);

    // Save periodically (every 10 outcomes)
    if (this.learningData.routingOutcomes.length % 10 === 0) {
      await this.saveLearningData();
    }
  }

  /**
   * Update agent performance statistics
   */
  updateAgentPerformance(outcome) {
    const agentId = outcome.agentId;
    
    if (!this.learningData.agentPerformance[agentId]) {
      this.learningData.agentPerformance[agentId] = {
        agentName: outcome.agentName,
        totalExecutions: 0,
        successes: 0,
        failures: 0,
        totalDuration: 0,
        byTaskType: {}
      };
    }

    const stats = this.learningData.agentPerformance[agentId];
    stats.totalExecutions++;
    stats.totalDuration += outcome.duration || 0;
    
    if (outcome.success) {
      stats.successes++;
    } else {
      stats.failures++;
    }

    // Track by task type
    if (outcome.taskType) {
      if (!stats.byTaskType[outcome.taskType]) {
        stats.byTaskType[outcome.taskType] = { successes: 0, failures: 0 };
      }
      
      if (outcome.success) {
        stats.byTaskType[outcome.taskType].successes++;
      } else {
        stats.byTaskType[outcome.taskType].failures++;
      }
    }
  }

  /**
   * Analyze learning data and optimize routing weights
   */
  async optimizeWeights() {
    if (!this.config.autoAdjustWeights) {
      return this.routingWeights;
    }

    const sessions = await this.countAnalyzedSessions();
    
    if (sessions < this.config.minSessionsForLearning) {
      console.log(chalk.gray(`  ℹ Need ${this.config.minSessionsForLearning - sessions} more sessions for weight optimization`));
      return this.routingWeights;
    }

    // Calculate current routing accuracy
    const currentAccuracy = this.calculateRoutingAccuracy();
    
    // Try different weight combinations and see which would have performed better
    const candidates = this.generateWeightCandidates();
    
    let bestWeights = this.routingWeights;
    let bestAccuracy = currentAccuracy;

    for (const candidate of candidates) {
      const accuracy = this.simulateRoutingAccuracy(candidate);
      
      if (accuracy > bestAccuracy) {
        bestAccuracy = accuracy;
        bestWeights = candidate;
      }
    }

    // If we found better weights, update
    if (bestAccuracy > currentAccuracy + 0.05) { // At least 5% improvement
      console.log(chalk.green(`  ✓ Improved routing weights: ${currentAccuracy.toFixed(2)} → ${bestAccuracy.toFixed(2)}`));
      console.log(chalk.gray(`    capability: ${bestWeights.capability.toFixed(2)}, semantic: ${bestWeights.semantic.toFixed(2)}, success: ${bestWeights.success.toFixed(2)}`));
      
      this.routingWeights = bestWeights;
      
      // Record in history
      this.learningData.weightsHistory.push({
        timestamp: Date.now(),
        weights: { ...bestWeights },
        accuracy: bestAccuracy,
        previousAccuracy: currentAccuracy
      });
      
      await this.saveRoutingWeights();
      await this.saveLearningData();
    }

    return this.routingWeights;
  }

  /**
   * Generate candidate weight combinations to test
   */
  generateWeightCandidates() {
    const { capability, semantic, success } = this.routingWeights;
    const shift = this.config.maxWeightShift;
    
    const candidates = [];
    
    // Increase capability weight
    candidates.push({
      capability: Math.min(1.0, capability + shift),
      semantic: semantic - shift / 2,
      success: success - shift / 2
    });
    
    // Increase semantic weight
    candidates.push({
      capability: capability - shift / 2,
      semantic: Math.min(1.0, semantic + shift),
      success: success - shift / 2
    });
    
    // Increase success weight
    candidates.push({
      capability: capability - shift / 2,
      semantic: semantic - shift / 2,
      success: Math.min(1.0, success + shift)
    });
    
    // Normalize all candidates
    return candidates.map(w => this.normalizeWeights(w));
  }

  /**
   * Normalize weights to sum to 1.0
   */
  normalizeWeights(weights) {
    const sum = weights.capability + weights.semantic + weights.success;
    return {
      capability: weights.capability / sum,
      semantic: weights.semantic / sum,
      success: weights.success / sum
    };
  }

  /**
   * Calculate current routing accuracy
   */
  calculateRoutingAccuracy() {
    const outcomes = this.learningData.routingOutcomes;
    
    if (outcomes.length === 0) {
      return 0;
    }

    const successes = outcomes.filter(o => o.success).length;
    return successes / outcomes.length;
  }

  /**
   * Simulate routing accuracy with different weights
   * (This is a simplified simulation - real implementation would re-score all historical decisions)
   */
  simulateRoutingAccuracy(weights) {
    // For now, use a heuristic based on correlation between confidence and success
    const outcomes = this.learningData.routingOutcomes;
    
    if (outcomes.length === 0) {
      return 0;
    }

    // Group by confidence ranges and see if higher confidence = higher success
    const highConfidence = outcomes.filter(o => o.confidence >= 0.7);
    const medConfidence = outcomes.filter(o => o.confidence >= 0.4 && o.confidence < 0.7);
    const lowConfidence = outcomes.filter(o => o.confidence < 0.4);

    const highSuccess = highConfidence.length > 0 ? highConfidence.filter(o => o.success).length / highConfidence.length : 0;
    const medSuccess = medConfidence.length > 0 ? medConfidence.filter(o => o.success).length / medConfidence.length : 0;
    const lowSuccess = lowConfidence.length > 0 ? lowConfidence.filter(o => o.success).length / lowConfidence.length : 0;

    // Weight simulation: if semantic weight increases, assume better correlation
    const semanticBoost = (weights.semantic - this.routingWeights.semantic) * 0.1;
    const successBoost = (weights.success - this.routingWeights.success) * 0.05;
    
    const estimatedAccuracy = (highSuccess + medSuccess + lowSuccess) / 3 + semanticBoost + successBoost;
    
    return Math.max(0, Math.min(1, estimatedAccuracy));
  }

  /**
   * Discover new agent capabilities from successful completions
   */
  async discoverCapabilities() {
    const minCount = this.config.minSuccessCountForCapability;
    const discovered = {};

    for (const [agentId, stats] of Object.entries(this.learningData.agentPerformance)) {
      const capabilities = [];

      // Check task types this agent succeeds at
      for (const [taskType, typeStats] of Object.entries(stats.byTaskType || {})) {
        const successRate = typeStats.successes / (typeStats.successes + typeStats.failures);
        
        if (typeStats.successes >= minCount && successRate >= this.config.confidenceThreshold) {
          capabilities.push({
            capability: taskType,
            successRate,
            count: typeStats.successes
          });
        }
      }

      if (capabilities.length > 0) {
        discovered[agentId] = capabilities;
        this.learningData.discoveredCapabilities[agentId] = capabilities;
      }
    }

    if (Object.keys(discovered).length > 0) {
      await this.saveLearningData();
    }

    return discovered;
  }

  /**
   * Extract task patterns from successful completions
   */
  async extractPatterns() {
    const outcomes = this.learningData.routingOutcomes;
    const patterns = {};

    for (const outcome of outcomes) {
      if (!outcome.success || !outcome.taskType) continue;

      const key = `${outcome.taskType}:${outcome.agentId}`;
      
      if (!patterns[key]) {
        patterns[key] = {
          taskType: outcome.taskType,
          agentId: outcome.agentId,
          agentName: outcome.agentName,
          successes: 0,
          failures: 0,
          totalDuration: 0
        };
      }

      patterns[key].successes++;
      patterns[key].totalDuration += outcome.duration || 0;
    }

    // Calculate success rates and filter
    const extracted = Object.values(patterns)
      .map(p => ({
        ...p,
        successRate: p.successes / (p.successes + p.failures),
        avgDuration: p.totalDuration / p.successes
      }))
      .filter(p => p.successes >= 3 && p.successRate >= 0.8)
      .sort((a, b) => b.successRate - a.successRate);

    this.learningData.taskPatterns = extracted;
    await this.saveLearningData();

    return extracted;
  }

  /**
   * Get learning statistics
   */
  async getStatistics() {
    const sessions = await this.countAnalyzedSessions();
    const accuracy = this.calculateRoutingAccuracy();
    
    const totalOutcomes = this.learningData.routingOutcomes.length;
    const successes = this.learningData.routingOutcomes.filter(o => o.success).length;
    
    const topAgents = Object.entries(this.learningData.agentPerformance)
      .map(([id, stats]) => ({
        id,
        name: stats.agentName,
        successRate: stats.successes / (stats.successes + stats.failures),
        executions: stats.totalExecutions
      }))
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 5);

    return {
      sessionsAnalyzed: sessions,
      routingDecisions: totalOutcomes,
      successfulRoutes: successes,
      failedRoutes: totalOutcomes - successes,
      overallAccuracy: accuracy,
      currentWeights: this.routingWeights,
      weightAdjustments: this.learningData.weightsHistory.length,
      discoveredCapabilities: Object.keys(this.learningData.discoveredCapabilities).length,
      taskPatterns: this.learningData.taskPatterns.length,
      topPerformingAgents: topAgents,
      readyForOptimization: sessions >= this.config.minSessionsForLearning
    };
  }

  /**
   * Count number of sessions analyzed
   */
  async countAnalyzedSessions() {
    try {
      const sessions = await fs.readdir(this.sessionsDir);
      const validSessions = [];

      for (const session of sessions) {
        const hooksDir = path.join(this.sessionsDir, session, 'hooks');
        if (await fs.pathExists(hooksDir)) {
          validSessions.push(session);
        }
      }

      return validSessions.length;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Reset learning data
   */
  async reset() {
    this.learningData = {
      routingOutcomes: [],
      agentPerformance: {},
      discoveredCapabilities: {},
      taskPatterns: [],
      weightsHistory: []
    };

    this.routingWeights = {
      capability: 0.4,
      semantic: 0.4,
      success: 0.2
    };

    await this.saveLearningData();
    await this.saveRoutingWeights();
  }

  // Utility methods

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  truncateString(str, maxLength) {
    if (!str || str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
  }
}

module.exports = SONALearner;
