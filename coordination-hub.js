const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const { v4: uuidv4 } = require('uuid');
const RuVectorMemory = require('./ruvector-memory');

/**
 * CoordinationHub enables agents to:
 * 1. Share findings with each other
 * 2. Request help from specialized agents
 * 3. Avoid duplicate work
 * 4. Build on each other's work
 * 5. Escalate issues that need human intervention
 */
class CoordinationHub {
  constructor(sessionDir, config = {}) {
    this.sessionDir = sessionDir;
    this.coordinationDir = path.join(sessionDir, 'coordination');
    this.sharedMemory = {
      findings: [],
      issues: [],
      fixes: [],
      recommendations: [],
      agentStates: {}
    };
    this.messageQueue = [];
    this.activeAgents = new Map();

    // Initialize vector memory for semantic search
    this.vectorMemory = new RuVectorMemory({
      dbPath: path.join(sessionDir, 'vector-memory'),
      ollama_url: config.ollama_url || 'http://localhost:11434',
      embedding_model: config.embedding_model || 'nomic-embed-text',
      dimSize: 384
    });
  }

  async initialize() {
    await fs.ensureDir(this.coordinationDir);
    await this.loadState();
    
    // Initialize vector memory for semantic search
    try {
      await this.vectorMemory.initialize();
      console.log(chalk.gray('  ✓ Vector memory initialized for semantic search'));
    } catch (error) {
      console.warn(chalk.yellow(`  ⚠ Vector memory initialization failed: ${error.message}`));
      console.warn(chalk.yellow('  → Coordination will work but without semantic search capabilities'));
    }
  }


  async registerAgent(agentId, agentConfig) {
    console.log(chalk.cyan(`📡 Registering agent ${agentConfig.name} for coordination\n`));

    this.activeAgents.set(agentId, {
      id: agentId,
      name: agentConfig.name,
      type: agentConfig.type,
      capabilities: agentConfig.coordination?.capabilities || [],
      status: 'active',
      startTime: Date.now()
    });

    await this.saveState();
  }

  async unregisterAgent(agentId) {
    const agent = this.activeAgents.get(agentId);
    if (agent) {
      agent.status = 'completed';
      agent.endTime = Date.now();
      await this.saveState();
    }
  }

  displayProgressUpdate(agent, finding) {
    const status = finding.status;
    const message = finding.message || finding.status;

    switch (status) {
      case 'started':
        console.log(chalk.blue(`  🚀 ${agent?.name}: ${message}`));
        break;
      case 'in-progress':
        const files = finding.files_analyzed ? ` [${finding.files_analyzed} files]` : '';
        const issues = finding.issues_found ? ` [${finding.issues_found} issues]` : '';
        console.log(chalk.yellow(`  ⏳ ${agent?.name}: ${message}${files}${issues}`));
        break;
      case 'phase-complete':
        console.log(chalk.cyan(`  ✓ ${agent?.name}: ${message}`));
        break;
      case 'complete':
        console.log(chalk.green(`  ✅ ${agent?.name}: ${message}`));
        break;
      default:
        console.log(chalk.gray(`  ℹ ${agent?.name}: ${message}`));
    }
  }

  /**
   * Agent shares a finding with other agents
   */
  async shareFinding(agentId, finding) {
    const agent = this.activeAgents.get(agentId);
    
    const sharedFinding = {
      id: uuidv4(),
      agentId,
      agentName: agent?.name,
      timestamp: Date.now(),
      ...finding
    };

    this.sharedMemory.findings.push(sharedFinding);
    
    // Store embedding in vector memory if description is available
    if (this.vectorMemory.isAvailable() && (finding.description || finding.message || finding.summary)) {
      try {
        const textToEmbed = finding.description || finding.message || finding.summary;
        const embedding = await this.vectorMemory.embed(textToEmbed);
        await this.vectorMemory.store(
          sharedFinding.id,
          embedding,
          {
            type: 'finding',
            agentId,
            agentName: agent?.name,
            text: textToEmbed,
            timestamp: Date.now(),
            finding: sharedFinding
          }
        );
      } catch (error) {
        // Silently fail - vector memory is optional
        console.log(chalk.gray(`    ℹ Could not store finding embedding: ${error.message}`));
      }
    }
    
    await this.saveState();

    // Handle progress updates
    if (finding.type === 'agent-progress') {
      this.displayProgressUpdate(agent, finding);
    } else {
      console.log(chalk.gray(`  ℹ ${agent?.name} shared: ${finding.summary || finding.message}`));
    }

    // Check if any other agent should be notified
    await this.notifyRelevantAgents(sharedFinding);

    return sharedFinding.id;
  }


  /**
   * Agent reports an issue
   */
  async reportIssue(agentId, issue) {
    const agent = this.activeAgents.get(agentId);
    
    const reportedIssue = {
      id: uuidv4(),
      agentId,
      agentName: agent?.name,
      timestamp: Date.now(),
      status: 'open',
      ...issue
    };

    this.sharedMemory.issues.push(reportedIssue);
    
    // Store embedding in vector memory if title or description is available
    if (this.vectorMemory.isAvailable() && (issue.title || issue.description)) {
      try {
        const textToEmbed = `${issue.title || ''} ${issue.description || ''}`.trim();
        const embedding = await this.vectorMemory.embed(textToEmbed);
        await this.vectorMemory.store(
          reportedIssue.id,
          embedding,
          {
            type: 'issue',
            agentId,
            agentName: agent?.name,
            text: textToEmbed,
            timestamp: Date.now(),
            issue: reportedIssue
          }
        );
      } catch (error) {
        // Silently fail - vector memory is optional
        console.log(chalk.gray(`    ℹ Could not store issue embedding: ${error.message}`));
      }
    }
    
    await this.saveState();

    console.log(chalk.yellow(`  ⚠ ${agent?.name} reported issue: ${issue.title}`));

    // Check if we have a specialized agent that can fix this
    await this.dispatchIssueToSpecialist(reportedIssue);

    return reportedIssue.id;
  }


  /**
   * Agent reports a successful fix
   */
  async reportFix(agentId, fix) {
    const agent = this.activeAgents.get(agentId);

    const reportedFix = {
      id: uuidv4(),
      agentId,
      agentName: agent?.name,
      timestamp: Date.now(),
      ...fix
    };

    this.sharedMemory.fixes.push(reportedFix);

    // Update related issue if exists
    if (fix.issueId) {
      const issue = this.sharedMemory.issues.find(i => i.id === fix.issueId);
      if (issue) {
        issue.status = 'resolved';
        issue.resolvedBy = agentId;
        issue.resolvedAt = Date.now();
      }
    }

    await this.saveState();

    console.log(chalk.green(`  ✓ ${agent?.name} fixed: ${fix.description}`));

    return reportedFix.id;
  }

  /**
   * Agent requests help from another agent
   */
  async requestHelp(agentId, request) {
    const agent = this.activeAgents.get(agentId);

    console.log(chalk.blue(`  🤝 ${agent?.name} requests: ${request.description}`));

    const helpRequest = {
      id: uuidv4(),
      requestingAgentId: agentId,
      requestingAgentName: agent?.name,
      timestamp: Date.now(),
      status: 'pending',
      ...request
    };

    this.messageQueue.push(helpRequest);
    await this.saveState();

    // Find suitable agent to help
    const helper = await this.findHelperAgent(request);

    if (helper) {
      console.log(chalk.blue(`  → Routing to ${helper.name}`));
      helpRequest.assignedTo = helper.id;
      helpRequest.status = 'assigned';
      await this.saveState();
    }

    return helpRequest;
  }

  /**
   * Agent queries shared findings
   */
  async queryFindings(agentId, query) {
    const relevantFindings = this.sharedMemory.findings.filter(finding => {
      // Filter based on query criteria
      if (query.type && finding.type !== query.type) return false;
      if (query.severity && finding.severity !== query.severity) return false;
      if (query.category && finding.category !== query.category) return false;
      if (query.file && !finding.file?.includes(query.file)) return false;
      return true;
    });

    return relevantFindings;
  }

  /**
   * Agent queries shared issues
   */
  async queryIssues(agentId, query) {
    const relevantIssues = this.sharedMemory.issues.filter(issue => {
      if (query.status && issue.status !== query.status) return false;
      if (query.severity && issue.severity !== query.severity) return false;
      if (query.type && issue.type !== query.type) return false;
      return true;
    });

    return relevantIssues;
  }

  /**
   * Get recommendations for an agent based on shared knowledge
   */
  async getRecommendations(agentId) {
    const agent = this.activeAgents.get(agentId);
    if (!agent) return [];

    const recommendations = [];

    // Check for unresolved issues this agent can handle
    const solvableIssues = this.sharedMemory.issues.filter(issue => {
      return issue.status === 'open' &&
        agent.capabilities.some(cap => issue.requiredCapability === cap);
    });

    if (solvableIssues.length > 0) {
      recommendations.push({
        type: 'issue_resolution',
        priority: 'high',
        message: `Found ${solvableIssues.length} issues you can resolve`,
        issues: solvableIssues.slice(0, 5)
      });
    }

    // Check for related findings
    const relatedFindings = this.sharedMemory.findings.filter(finding => {
      return finding.agentId !== agentId &&
        finding.category === agent.type;
    });

    if (relatedFindings.length > 0) {
      recommendations.push({
        type: 'context',
        priority: 'medium',
        message: `Review ${relatedFindings.length} related findings from other agents`,
        findings: relatedFindings.slice(0, 3)
      });
    }

    return recommendations;
  }

  /**
   * Notify relevant agents about a finding
   */
  async notifyRelevantAgents(finding) {
    for (const [agentId, agent] of this.activeAgents) {
      if (agent.id === finding.agentId) continue; // Don't notify self
      if (agent.status !== 'active') continue;

      // Check if agent's capabilities match the finding
      const isRelevant = agent.capabilities.some(cap =>
        finding.tags?.includes(cap) || finding.type === cap
      );

      if (isRelevant) {
        console.log(chalk.gray(`    → Notified ${agent.name}`));
      }
    }
  }

  /**
   * Find a specialist agent to handle an issue
   * Uses intelligent routing based on semantic similarity and past success
   */
  async dispatchIssueToSpecialist(issue) {
    // Use intelligent routing to find the best agent
    const routing = await this.selectBestAgent(issue);

    if (routing.agent) {
      console.log(chalk.blue(`    → Best handled by: ${routing.agent.name} (confidence: ${(routing.confidence * 100).toFixed(0)}%)`));
      
      if (routing.reason) {
        console.log(chalk.gray(`      Reason: ${routing.reason}`));
      }

      this.sharedMemory.recommendations.push({
        issueId: issue.id,
        recommendedAgent: routing.agent.name,
        recommendedAgentId: routing.agent.id,
        confidence: routing.confidence,
        reason: routing.reason,
        alternatives: routing.alternatives
      });

      await this.saveState();
    } else {
      console.log(chalk.gray(`    → No suitable specialist found (confidence: ${(routing.confidence * 100).toFixed(0)}%)`));
    }
  }

  /**
   * Select the best agent to handle an issue using intelligent routing
   * Combines semantic similarity, capability matching, and historical success
   * @param {Object} issue - Issue to route
   * @param {Object} options - Routing options
   * @returns {Promise<Object>} Routing decision with agent, confidence, and reason
   */
  async selectBestAgent(issue, options = {}) {
    const {
      minConfidence = 0.3,  // Minimum confidence threshold to recommend an agent
      maxCandidates = 5,    // Maximum number of candidates to consider
      useSemanticSearch = true
    } = options;

    // Get all available agents
    const availableAgents = Array.from(this.activeAgents.values()).filter(
      agent => agent.status === 'active'
    );

    if (availableAgents.length === 0) {
      return {
        agent: null,
        confidence: 0,
        reason: 'No active agents available',
        alternatives: []
      };
    }

    // Score each agent
    const scoredAgents = await Promise.all(
      availableAgents.map(async agent => {
        const score = await this.scoreAgentForIssue(agent, issue, { useSemanticSearch });
        return { agent, score };
      })
    );

    // Sort by score descending
    scoredAgents.sort((a, b) => b.score.total - a.score.total);

    const topAgent = scoredAgents[0];
    const alternatives = scoredAgents.slice(1, maxCandidates).map(s => ({
      name: s.agent.name,
      confidence: s.score.total
    }));

    // Check if confidence meets threshold
    if (topAgent.score.total < minConfidence) {
      return {
        agent: null,
        confidence: topAgent.score.total,
        reason: `Low confidence (${(topAgent.score.total * 100).toFixed(0)}% < ${(minConfidence * 100).toFixed(0)}% threshold)`,
        alternatives
      };
    }

    return {
      agent: topAgent.agent,
      confidence: topAgent.score.total,
      reason: topAgent.score.reason,
      alternatives
    };
  }

  /**
   * Score an agent's suitability for handling an issue
   * @param {Object} agent - Agent to score
   * @param {Object} issue - Issue to handle
   * @param {Object} options - Scoring options
   * @returns {Promise<Object>} Score breakdown
   */
  async scoreAgentForIssue(agent, issue, options = {}) {
    const { useSemanticSearch = true } = options;
    
    let capabilityScore = 0;
    let semanticScore = 0;
    let successScore = 0;
    let reasons = [];

    // 1. Capability matching (40% weight)
    const capabilityNeeded = issue.requiredCapability || this.inferCapability(issue);
    if (agent.capabilities.includes(capabilityNeeded)) {
      capabilityScore = 1.0;
      reasons.push(`has ${capabilityNeeded} capability`);
    } else {
      // Partial match for related capabilities
      const relatedCaps = this.getRelatedCapabilities(capabilityNeeded);
      const matchedRelated = agent.capabilities.filter(cap => relatedCaps.includes(cap));
      if (matchedRelated.length > 0) {
        capabilityScore = 0.5;
        reasons.push(`has related capability: ${matchedRelated[0]}`);
      }
    }

    // 2. Semantic similarity to past successful resolutions (40% weight)
    if (useSemanticSearch && this.vectorMemory.isAvailable()) {
      try {
        const issueText = `${issue.title || ''} ${issue.description || ''}`.trim();
        if (issueText) {
          const similarIssues = await this.searchSimilarIssues(issueText, 10);
          
          // Find issues this agent successfully resolved
          const agentSuccesses = similarIssues.filter(
            s => s.issue?.resolvedBy === agent.id && s.issue?.status === 'resolved'
          );

          if (agentSuccesses.length > 0) {
            // Average similarity score of successfully resolved issues
            semanticScore = agentSuccesses.reduce((sum, s) => sum + (s.score || 0), 0) / agentSuccesses.length;
            reasons.push(`resolved ${agentSuccesses.length} similar issue(s)`);
          }
        }
      } catch (error) {
        // Semantic search failed, continue without it
        console.log(chalk.gray(`      ℹ Semantic scoring failed: ${error.message}`));
      }
    }

    // 3. Historical success rate (20% weight)
    const agentStats = this.getAgentStats(agent.id);
    if (agentStats.totalIssues > 0) {
      successScore = agentStats.resolvedIssues / agentStats.totalIssues;
      if (agentStats.resolvedIssues > 0) {
        reasons.push(`${agentStats.resolvedIssues}/${agentStats.totalIssues} issues resolved`);
      }
    }

    // Calculate weighted total
    const total = (
      capabilityScore * 0.4 +
      semanticScore * 0.4 +
      successScore * 0.2
    );

    return {
      total,
      capability: capabilityScore,
      semantic: semanticScore,
      success: successScore,
      reason: reasons.length > 0 ? reasons.join(', ') : 'no specific match'
    };
  }

  /**
   * Get related capabilities for a given capability
   * @param {string} capability - Primary capability
   * @returns {Array<string>} Related capabilities
   */
  getRelatedCapabilities(capability) {
    const relationshipMap = {
      'security-analysis': ['vulnerability-detection', 'secret-scanning', 'code-security'],
      'vulnerability-detection': ['security-analysis', 'secret-scanning'],
      'testing': ['test-generation', 'quality-assurance'],
      'test-generation': ['testing', 'quality-assurance'],
      'api-integration': ['api-testing', 'endpoint-analysis'],
      'ui-interaction': ['accessibility', 'responsive-design'],
      'optimization': ['performance-analysis', 'code-optimization'],
      'code-style': ['linting', 'formatting', 'refactoring']
    };

    return relationshipMap[capability] || [];
  }

  /**
   * Get statistics for an agent's performance
   * @param {string} agentId - Agent ID
   * @returns {Object} Agent statistics
   */
  getAgentStats(agentId) {
    const agentIssues = this.sharedMemory.issues.filter(i => i.agentId === agentId);
    const resolvedByAgent = this.sharedMemory.issues.filter(i => i.resolvedBy === agentId);

    return {
      totalIssues: agentIssues.length,
      resolvedIssues: resolvedByAgent.length,
      openIssues: agentIssues.filter(i => i.status === 'open').length,
      totalFindings: this.sharedMemory.findings.filter(f => f.agentId === agentId).length,
      totalFixes: this.sharedMemory.fixes.filter(f => f.agentId === agentId).length
    };
  }

  /**
   * Find an agent to help with a request
   * Now uses intelligent routing for better agent selection
   */
  async findHelperAgent(request) {
    // Use intelligent routing if request has description
    if (request.description || request.title) {
      const issue = {
        title: request.title || request.description,
        description: request.description,
        requiredCapability: request.capability
      };

      const routing = await this.selectBestAgent(issue);
      return routing.agent;
    }

    // Fallback to simple capability matching
    const helpers = Array.from(this.activeAgents.values()).filter(agent =>
      agent.capabilities.includes(request.capability) &&
      agent.status === 'active'
    );

    return helpers[0] || null;
  }

  /**
   * Recommend agents for a workflow task
   * @param {Object} task - Task description
   * @returns {Promise<Object>} Routing recommendation
   */
  async recommendAgentForTask(task) {
    const issue = {
      title: task.name || task.description,
      description: task.description || task.goal,
      type: task.type,  // Keep type for inference
      requiredCapability: task.requiredCapability  // Only use explicit capability if provided
    };

    return await this.selectBestAgent(issue, {
      minConfidence: 0.2,  // Lower threshold for recommendations
      maxCandidates: 3
    });
  }

  /**
   * Infer what capability is needed for an issue
   */
  inferCapability(issue) {
    const capabilityMap = {
      'api': 'api-integration',
      'ui': 'ui-interaction',
      'performance': 'optimization',
      'security': 'security-analysis',
      'test': 'testing',
      'style': 'code-style'
    };

    for (const [key, capability] of Object.entries(capabilityMap)) {
      if (issue.type?.includes(key) || issue.title?.toLowerCase().includes(key)) {
        return capability;
      }
    }

    return 'general';
  }

  /**
   * Generate a coordination summary for the user
   */
  async generateCoordinationSummary() {
    const summary = {
      totalFindings: this.sharedMemory.findings.length,
      openIssues: this.sharedMemory.issues.filter(i => i.status === 'open').length,
      resolvedIssues: this.sharedMemory.issues.filter(i => i.status === 'resolved').length,
      totalFixes: this.sharedMemory.fixes.length,
      activeAgents: Array.from(this.activeAgents.values()).filter(a => a.status === 'active').length,
      completedAgents: Array.from(this.activeAgents.values()).filter(a => a.status === 'completed').length
    };

    console.log(chalk.blue.bold('\n📊 Coordination Summary:\n'));
    console.log(chalk.white(`  Findings shared: ${summary.totalFindings}`));
    console.log(chalk.yellow(`  Issues open: ${summary.openIssues}`));
    console.log(chalk.green(`  Issues resolved: ${summary.resolvedIssues}`));
    console.log(chalk.white(`  Fixes applied: ${summary.totalFixes}`));
    console.log(chalk.cyan(`  Active agents: ${summary.activeAgents}`));
    console.log(chalk.gray(`  Completed agents: ${summary.completedAgents}\n`));

    return summary;
  }

  /**
   * Save coordination state to disk
   */
  async saveState() {
    const state = {
      sharedMemory: this.sharedMemory,
      messageQueue: this.messageQueue,
      activeAgents: Array.from(this.activeAgents.entries())
    };

    await fs.writeJSON(
      path.join(this.coordinationDir, 'state.json'),
      state,
      { spaces: 2 }
    );
  }

  /**
   * Load coordination state from disk
   */
  async loadState() {
    const statePath = path.join(this.coordinationDir, 'state.json');

    if (await fs.pathExists(statePath)) {
      const state = await fs.readJSON(statePath);
      this.sharedMemory = state.sharedMemory || this.sharedMemory;
      this.messageQueue = state.messageQueue || [];
      this.activeAgents = new Map(state.activeAgents || []);
    }
  }

  /**
   * Initialize coordination for a workflow
   */
  async initializeWorkflow(workflow) {
    console.log(chalk.blue(`\n🔗 Initializing coordination for workflow: ${workflow.name}\n`));

    this.sharedMemory.workflowContext = {
      name: workflow.name,
      goal: workflow.goal,
      startTime: Date.now()
    };

    await this.saveState();
  }

  /**
   * Initialize coordination for a pipeline
   */
  async initializePipeline(pipeline) {
    console.log(chalk.blue(`\n🔗 Initializing coordination for pipeline: ${pipeline.name}\n`));

    this.sharedMemory.pipelineContext = {
      name: pipeline.name,
      strategy: pipeline.strategy,
      goal: pipeline.goal,
      startTime: Date.now()
    };

    await this.saveState();
  }

  /**
   * Coordinate a specific step in a workflow
   */
  async coordinateStep(step, previousResults) {
    console.log(chalk.blue(`\n🤝 Coordinating: ${step.description}\n`));

    // Analyze previous results
    const insights = this.analyzePreviousResults(previousResults);

    // Share insights with upcoming agents
    if (step.share_insights) {
      await this.shareFinding('coordinator', {
        type: 'coordination-insight',
        summary: step.description,
        insights,
        forUpcomingAgents: step.upcoming_agents || []
      });
    }

    return insights;
  }

  /**
   * Analyze results from previous agents
   */
  analyzePreviousResults(results) {
    const insights = {
      totalIssuesFound: 0,
      criticalIssues: [],
      recommendations: []
    };

    for (const result of results) {
      if (result.result?.issues) {
        insights.totalIssuesFound += result.result.issues.length;

        const critical = result.result.issues.filter(i => i.severity === 'critical');
        insights.criticalIssues.push(...critical);
      }
    }

    return insights;
  }
  /**
   * Search for similar findings using semantic search
   * @param {string} queryText - Text to search for
   * @param {number} k - Number of results to return
   * @returns {Promise<Array>} Similar findings
   */
  async searchSimilarFindings(queryText, k = 5) {
    if (!this.vectorMemory.isAvailable()) {
      return []; // Fallback: return empty if vector memory not available
    }

    try {
      const queryEmbedding = await this.vectorMemory.embed(queryText);
      const results = await this.vectorMemory.search(queryEmbedding, k);
      
      // Filter to only findings
      return results
        .filter(r => r.metadata?.type === 'finding')
        .map(r => ({
          id: r.id,
          score: r.score,
          finding: r.metadata?.finding
        }));
    } catch (error) {
      console.log(chalk.gray(`    ℹ Semantic search failed: ${error.message}`));
      return [];
    }
  }

  /**
   * Search for similar issues using semantic search
   * @param {string} queryText - Text to search for
   * @param {number} k - Number of results to return
   * @returns {Promise<Array>} Similar issues
   */
  async searchSimilarIssues(queryText, k = 5) {
    if (!this.vectorMemory.isAvailable()) {
      return []; // Fallback: return empty if vector memory not available
    }

    try {
      const queryEmbedding = await this.vectorMemory.embed(queryText);
      const results = await this.vectorMemory.search(queryEmbedding, k);
      
      // Filter to only issues
      return results
        .filter(r => r.metadata?.type === 'issue')
        .map(r => ({
          id: r.id,
          score: r.score,
          issue: r.metadata?.issue
        }));
    } catch (error) {
      console.log(chalk.gray(`    ℹ Semantic search failed: ${error.message}`));
      return [];
    }
  }
}


module.exports = CoordinationHub;
