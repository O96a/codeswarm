const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const { v4: uuidv4 } = require('uuid');

/**
 * CoordinationHub enables agents to:
 * 1. Share findings with each other
 * 2. Request help from specialized agents
 * 3. Avoid duplicate work
 * 4. Build on each other's work
 * 5. Escalate issues that need human intervention
 */
class CoordinationHub {
  constructor(sessionDir) {
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
  }

  async initialize() {
    await fs.ensureDir(this.coordinationDir);
    await this.loadState();
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
    await this.saveState();

    console.log(chalk.gray(`  ℹ ${agent?.name} shared: ${finding.summary}`));

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
   */
  async dispatchIssueToSpecialist(issue) {
    // In a real implementation, this would trigger the appropriate agent
    // For now, we log the recommendation
    
    const capabilityNeeded = issue.requiredCapability || this.inferCapability(issue);
    
    const specialist = Array.from(this.activeAgents.values()).find(agent => 
      agent.capabilities.includes(capabilityNeeded) && 
      agent.status === 'active'
    );

    if (specialist) {
      console.log(chalk.blue(`    → Best handled by: ${specialist.name}`));
      
      this.sharedMemory.recommendations.push({
        issueId: issue.id,
        recommendedAgent: specialist.name,
        reason: `Has capability: ${capabilityNeeded}`
      });
      
      await this.saveState();
    }
  }

  /**
   * Find an agent to help with a request
   */
  async findHelperAgent(request) {
    const helpers = Array.from(this.activeAgents.values()).filter(agent => 
      agent.capabilities.includes(request.capability) && 
      agent.status === 'active'
    );

    return helpers[0] || null;
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
}

module.exports = CoordinationHub;
