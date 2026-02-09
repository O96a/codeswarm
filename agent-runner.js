const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const yaml = require('yaml');

class AgentRunner {
  constructor(config) {
    this.config = config;
  }

  async execute(agentName, agentConfig, options) {
    console.log(chalk.cyan(`\n▶ Executing: ${agentConfig.name}\n`));

    // Set up Claude Code environment
    process.env.ANTHROPIC_AUTH_TOKEN = 'ollama';
    process.env.ANTHROPIC_BASE_URL = this.config.ollama_url;
    process.env.ANTHROPIC_API_KEY = '';

    // Create instructions file for Claude Code
    const instructionsPath = path.join(process.cwd(), '.codeswarm', 'temp', `${options.agentId}-instructions.md`);
    await fs.ensureDir(path.dirname(instructionsPath));
    
    let instructions = agentConfig.instructions;

    // Add coordination context if enabled
    if (agentConfig.coordination?.enabled && options.coordinationHub) {
      instructions += await this.buildCoordinationContext(options.coordinationHub, options.agentId, agentConfig);
    }

    await fs.writeFile(instructionsPath, instructions);

    // Run Claude Code
    try {
      const command = `claude --model ${agentConfig.model || this.config.model} < ${instructionsPath}`;
      const output = execSync(command, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024
      });

      console.log(chalk.green('\n✓ Agent completed\n'));

      // Parse output and extract findings
      const result = this.parseAgentOutput(output, agentConfig);

      // Share findings via coordination hub
      if (agentConfig.coordination?.enabled && options.coordinationHub) {
        await this.shareCoordinationData(options.coordinationHub, options.agentId, result, agentConfig);
      }

      return result;

    } catch (error) {
      console.error(chalk.red(`\n✗ Agent failed: ${error.message}\n`));
      throw error;
    } finally {
      await fs.remove(instructionsPath);
    }
  }

  async buildCoordinationContext(hub, agentId, agentConfig) {
    let context = '\n\n## COORDINATION CONTEXT\n\n';

    // Get recommendations
    const recommendations = await hub.getRecommendations(agentId);
    if (recommendations.length > 0) {
      context += '### Recommendations for You:\n';
      for (const rec of recommendations) {
        context += `- [${rec.priority}] ${rec.message}\n`;
      }
      context += '\n';
    }

    // Get relevant findings from requires_findings_from agents
    if (agentConfig.coordination.requires_findings_from) {
      context += '### Findings from Previous Agents:\n';
      for (const sourceAgent of agentConfig.coordination.requires_findings_from) {
        const findings = await hub.queryFindings(agentId, { agentName: sourceAgent });
        context += `\n#### From ${sourceAgent}:\n`;
        context += JSON.stringify(findings, null, 2) + '\n';
      }
    }

    // Get open issues
    const openIssues = await hub.queryIssues(agentId, { status: 'open' });
    if (openIssues.length > 0) {
      context += '\n### Open Issues You Can Address:\n';
      for (const issue of openIssues.slice(0, 5)) {
        context += `- [${issue.severity}] ${issue.title}\n`;
      }
    }

    return context;
  }

  async shareCoordinationData(hub, agentId, result, agentConfig) {
    // Share findings
    if (result.findings) {
      for (const finding of result.findings) {
        await hub.shareFinding(agentId, finding);
      }
    }

    // Report issues
    if (result.issues) {
      for (const issue of result.issues) {
        await hub.reportIssue(agentId, issue);
      }
    }

    // Report fixes
    if (result.fixes) {
      for (const fix of result.fixes) {
        await hub.reportFix(agentId, fix);
      }
    }
  }

  parseAgentOutput(output, agentConfig) {
    // Parse agent output to extract structured data
    return {
      success: true,
      output,
      findings: [],
      issues: [],
      fixes: []
    };
  }
}

module.exports = AgentRunner;
