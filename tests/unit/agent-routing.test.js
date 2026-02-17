const fs = require('fs-extra');
const path = require('path');
const CoordinationHub = require('../../src/coordination-hub');

describe('Agent Routing', () => {
  let hub;
  let sessionDir;

  beforeEach(async () => {
    sessionDir = path.join(__dirname, '../../.test-routing');
    await fs.ensureDir(sessionDir);
    
    hub = new CoordinationHub(sessionDir, {
      ollama_url: 'http://localhost:11434',
      embedding_model: 'nomic-embed-text'
    });
    
    await hub.initialize();

    // Register test agents with different capabilities
    await hub.registerAgent('agent1', {
      name: 'Security Scanner',
      type: 'investigator',
      coordination: {
        capabilities: ['security-analysis', 'vulnerability-detection']
      }
    });

    await hub.registerAgent('agent2', {
      name: 'Test Writer',
      type: 'builder',
      coordination: {
        capabilities: ['testing', 'test-generation']
      }
    });

    await hub.registerAgent('agent3', {
      name: 'API Detective',
      type: 'investigator',
      coordination: {
        capabilities: ['api-integration', 'endpoint-analysis']
      }
    });

    await hub.registerAgent('agent4', {
      name: 'Code Janitor',
      type: 'fixer',
      coordination: {
        capabilities: ['code-style', 'linting', 'formatting']
      }
    });
  });

  afterEach(async () => {
    await fs.remove(sessionDir);
  });

  describe('selectBestAgent', () => {
    test('should select agent by exact capability match', async () => {
      const issue = {
        title: 'Security vulnerability found',
        description: 'SQL injection risk in user input',
        requiredCapability: 'security-analysis'
      };

      const routing = await hub.selectBestAgent(issue);

      expect(routing.agent).toBeDefined();
      expect(routing.agent.name).toBe('Security Scanner');
      expect(routing.confidence).toBeGreaterThan(0.3);
      expect(routing.reason).toContain('security-analysis');
    });

    test('should select agent by related capability', async () => {
      const issue = {
        title: 'Need to scan for secrets in code',
        description: 'Check for hardcoded API keys',
        requiredCapability: 'secret-scanning'
      };

      hub.getRelatedCapabilities = jest.fn().mockReturnValue(['security-analysis', 'vulnerability-detection']);

      const routing = await hub.selectBestAgent(issue);

      expect(routing.agent).toBeDefined();
      // Should match agent with security-analysis (related capability)
      expect(routing.confidence).toBeGreaterThan(0);
    });

    test('should return null agent when confidence below threshold', async () => {
      const issue = {
        title: 'Unknown task',
        description: 'Something completely unrelated',
        requiredCapability: 'non-existent-capability'
      };

      const routing = await hub.selectBestAgent(issue, { minConfidence: 0.5 });

      expect(routing.agent).toBeNull();
      expect(routing.confidence).toBeLessThan(0.5);
      expect(routing.reason).toContain('Low confidence');
    });

    test('should include alternative agents', async () => {
      const issue = {
        title: 'Code quality issue',
        requiredCapability: 'testing'
      };

      const routing = await hub.selectBestAgent(issue, { maxCandidates: 3 });

      expect(routing.alternatives).toBeDefined();
      expect(Array.isArray(routing.alternatives)).toBe(true);
      expect(routing.alternatives.length).toBeGreaterThan(0);
      expect(routing.alternatives.length).toBeLessThanOrEqual(3);
    });

    test('should handle no active agents', async () => {
      // Unregister all agents
      for (const [agentId] of hub.activeAgents) {
        await hub.unregisterAgent(agentId);
      }

      const issue = {
        title: 'Test issue',
        requiredCapability: 'testing'
      };

      const routing = await hub.selectBestAgent(issue);

      expect(routing.agent).toBeNull();
      expect(routing.confidence).toBe(0);
      expect(routing.reason).toContain('No active agents');
    });
  });

  describe('scoreAgentForIssue', () => {
    test('should score capability match highly', async () => {
      const agent = {
        id: 'agent1',
        name: 'Security Scanner',
        capabilities: ['security-analysis']
      };

      const issue = {
        requiredCapability: 'security-analysis'
      };

      const score = await hub.scoreAgentForIssue(agent, issue, { useSemanticSearch: false });

      expect(score.total).toBeGreaterThan(0);
      expect(score.capability).toBe(1.0);
      expect(score.reason).toContain('security-analysis');
    });

    test('should handle partial capability match', async () => {
      const agent = {
        id: 'agent1',
        name: 'Security Scanner',
        capabilities: ['vulnerability-detection']
      };

      const issue = {
        requiredCapability: 'security-analysis'
      };

      hub.getRelatedCapabilities = jest.fn().mockReturnValue(['vulnerability-detection']);

      const score = await hub.scoreAgentForIssue(agent, issue, { useSemanticSearch: false });

      expect(score.capability).toBe(0.5);
      expect(score.reason).toContain('related capability');
    });

    test('should score semantic similarity when available', async () => {
      // Mock vector memory availability
      hub.vectorMemory.isAvailable = jest.fn().mockReturnValue(true);
      hub.searchSimilarIssues = jest.fn().mockResolvedValue([
        {
          issue: { resolvedBy: 'agent1', status: 'resolved' },
          score: 0.85
        },
        {
          issue: { resolvedBy: 'agent1', status: 'resolved' },
          score: 0.75
        }
      ]);

      const agent = {
        id: 'agent1',
        name: 'Security Scanner',
        capabilities: ['security-analysis']
      };

      const issue = {
        title: 'Security issue',
        description: 'Similar to previous issues',
        requiredCapability: 'security-analysis'
      };

      const score = await hub.scoreAgentForIssue(agent, issue, { useSemanticSearch: true });

      expect(score.semantic).toBeGreaterThan(0);
      expect(score.reason).toContain('resolved');
      expect(score.reason).toContain('similar issue');
    });

    test('should score historical success rate', async () => {
      // Add some historical data
      await hub.reportIssue('agent1', {
        title: 'Issue 1',
        description: 'Test issue 1'
      });

      await hub.reportIssue('agent1', {
        title: 'Issue 2',
        description: 'Test issue 2'
      });

      // Mark one as resolved by this agent
      hub.sharedMemory.issues[0].status = 'resolved';
      hub.sharedMemory.issues[0].resolvedBy = 'agent1';
      await hub.saveState();

      const agent = {
        id: 'agent1',
        name: 'Security Scanner',
        capabilities: ['security-analysis']
      };

      const issue = {
        requiredCapability: 'security-analysis'
      };

      const score = await hub.scoreAgentForIssue(agent, issue, { useSemanticSearch: false });

      expect(score.success).toBeGreaterThan(0);
      expect(score.reason).toContain('resolved');
    });
  });

  describe('getRelatedCapabilities', () => {
    test('should return related capabilities for security', () => {
      const related = hub.getRelatedCapabilities('security-analysis');

      expect(Array.isArray(related)).toBe(true);
      expect(related).toContain('vulnerability-detection');
      expect(related).toContain('secret-scanning');
    });

    test('should return related capabilities for testing', () => {
      const related = hub.getRelatedCapabilities('testing');

      expect(related).toContain('test-generation');
      expect(related).toContain('quality-assurance');
    });

    test('should return empty array for unknown capability', () => {
      const related = hub.getRelatedCapabilities('unknown-capability');

      expect(Array.isArray(related)).toBe(true);
      expect(related.length).toBe(0);
    });
  });

  describe('getAgentStats', () => {
    test('should return agent statistics', async () => {
      // Add some data for agent1
      await hub.shareFinding('agent1', {
        summary: 'Found security issue',
        type: 'security'
      });

      await hub.reportIssue('agent1', {
        title: 'Issue 1',
        description: 'Test'
      });

      await hub.reportFix('agent1', {
        description: 'Fixed issue 1',
        issueId: hub.sharedMemory.issues[0].id
      });

      const stats = hub.getAgentStats('agent1');

      expect(stats.totalIssues).toBeGreaterThan(0);
      expect(stats.totalFindings).toBeGreaterThan(0);
      expect(stats.totalFixes).toBeGreaterThan(0);
      expect(stats.resolvedIssues).toBeGreaterThan(0);
    });

    test('should return zero stats for unknown agent', () => {
      const stats = hub.getAgentStats('unknown-agent');

      expect(stats.totalIssues).toBe(0);
      expect(stats.resolvedIssues).toBe(0);
      expect(stats.totalFindings).toBe(0);
      expect(stats.totalFixes).toBe(0);
    });
  });

  describe('dispatchIssueToSpecialist', () => {
    test('should recommend agent using intelligent routing', async () => {
      const issue = {
        id: 'test-issue-1',
        title: 'Security vulnerability',
        description: 'SQL injection found',
        requiredCapability: 'security-analysis'
      };

      await hub.dispatchIssueToSpecialist(issue);

      expect(hub.sharedMemory.recommendations.length).toBeGreaterThan(0);
      const recommendation = hub.sharedMemory.recommendations[0];
      
      expect(recommendation.issueId).toBe(issue.id);
      expect(recommendation.recommendedAgent).toBe('Security Scanner');
      expect(recommendation.confidence).toBeGreaterThan(0);
      expect(recommendation.reason).toBeDefined();
    });

    test('should handle no suitable agent found', async () => {
      const issue = {
        id: 'test-issue-2',
        title: 'Unknown task',
        requiredCapability: 'non-existent'
      };

      await hub.dispatchIssueToSpecialist(issue);

      // Should not crash, just log that no agent was found
      expect(hub.sharedMemory.recommendations.length).toBe(0);
    });
  });

  describe('findHelperAgent', () => {
    test('should use intelligent routing when description provided', async () => {
      const request = {
        title: 'Need security scan',
        description: 'Check code for vulnerabilities',
        capability: 'security-analysis'
      };

      const helper = await hub.findHelperAgent(request);

      expect(helper).toBeDefined();
      expect(helper.name).toBe('Security Scanner');
    });

    test('should fallback to simple matching without description', async () => {
      const request = {
        capability: 'testing'
      };

      const helper = await hub.findHelperAgent(request);

      expect(helper).toBeDefined();
      expect(helper.capabilities).toContain('testing');
    });

    test('should return null when no helper available', async () => {
      const request = {
        capability: 'non-existent-capability'
      };

      const helper = await hub.findHelperAgent(request);

      expect(helper).toBeNull();
    });
  });

  describe('recommendAgentForTask', () => {
    test('should recommend agent for workflow task', async () => {
      const task = {
        name: 'Security Analysis',
        description: 'Scan codebase for security issues',
        type: 'security'
      };

      const recommendation = await hub.recommendAgentForTask(task);

      expect(recommendation.agent).toBeDefined();
      expect(recommendation.confidence).toBeGreaterThan(0);
      expect(recommendation.alternatives).toBeDefined();
    });

    test('should use lower confidence threshold for recommendations', async () => {
      const task = {
        name: 'Generic Task',
        description: 'Do something',
        type: 'unknown'
      };

      const recommendation = await hub.recommendAgentForTask(task);

      // Should still attempt to recommend even with low confidence
      // because minConfidence is 0.2 for recommendations
      expect(recommendation).toBeDefined();
    });

    test('should limit alternative candidates', async () => {
      const task = {
        name: 'Code Quality Task',
        description: 'Improve code quality',
        type: 'general'
      };

      const recommendation = await hub.recommendAgentForTask(task);

      expect(recommendation.alternatives.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Integration with semantic search', () => {
    test('should use semantic search when vector memory available', async () => {
      const mockSearchResults = [
        {
          issue: {
            id: 'old-issue-1',
            resolvedBy: 'agent1',
            status: 'resolved'
          },
          score: 0.9
        }
      ];

      hub.vectorMemory.isAvailable = jest.fn().mockReturnValue(true);
      hub.searchSimilarIssues = jest.fn().mockResolvedValue(mockSearchResults);

      const issue = {
        title: 'Similar security issue',
        description: 'SQL injection vulnerability',
        requiredCapability: 'security-analysis'
      };

      const routing = await hub.selectBestAgent(issue);

      expect(hub.searchSimilarIssues).toHaveBeenCalled();
      expect(routing.agent).toBeDefined();
    });

    test('should work without semantic search', async () => {
      hub.vectorMemory.isAvailable = jest.fn().mockReturnValue(false);

      const issue = {
        title: 'Test issue',
        requiredCapability: 'testing'
      };

      const routing = await hub.selectBestAgent(issue, { useSemanticSearch: false });

      expect(routing.agent).toBeDefined();
      // Should still route based on capabilities alone
      expect(routing.agent.name).toBe('Test Writer');
    });
  });
});
