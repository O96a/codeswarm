const { execSync, spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const yaml = require('yaml');
const ui = require('./ui-formatter');
const SchemaValidator = require('./schema-validator');
const ModelResolver = require('./model-resolver');

class AgentRunner {
  constructor(config, providerManager = null) {
    this.config = config;
    this.validator = new SchemaValidator();
    this.modelResolver = new ModelResolver(config);
    this.runningProcesses = new Map();

    // Use provided provider manager or create standalone one
    if (providerManager) {
      this.providerManager = providerManager;
    } else {
      // Backward compatibility: create standalone provider manager
      const { LLMProviderManager } = require('./llm-provider');
      const ClaudeCodeProvider = require('./providers/claude-code');
      this.providerManager = new LLMProviderManager(config);
      this.providerManager.register(
        'claude-code',
        new ClaudeCodeProvider(config.llm?.providers?.['claude-code'] || { model: config.model, ollama_url: config.ollama_url })
      );
    }

    this.setupSignalHandlers();
  }

  /**
   * Setup handlers for graceful shutdown
   */
  setupSignalHandlers() {
    const gracefulShutdown = async (signal) => {
      console.log(chalk.yellow(`\n\n⚠ Received ${signal}, shutting down gracefully...`));
      for (const [agentId, process] of this.runningProcesses) {
        console.log(chalk.yellow(`  Terminating agent: ${agentId}`));
        process.kill('SIGTERM');
      }
      process.exit(0);
    };

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
  }

  async execute(agentName, agentConfig, options) {
    ui.progress(`Executing ${agentConfig.name}...`);

    // Report progress start
    if (agentConfig.coordination?.enabled && options.coordinationHub) {
      await options.coordinationHub.shareFinding(options.agentId, {
        type: 'agent-progress',
        status: 'started',
        agentName: agentConfig.name,
        timestamp: new Date().toISOString(),
        message: `🤖 Agent ${agentConfig.name} is starting investigation...`
      });
    }

    // Set up Claude Code environment
    if (process.env.CLAUDE_CODE_OLLAMA_MODEL) {
      // Using native Ollama integration - do not override Anthropic URLs
      // unless explicitly needed.
      // We will use the model defined in the env var.
    } else {
      process.env.ANTHROPIC_AUTH_TOKEN = 'ollama';
      process.env.ANTHROPIC_BASE_URL = this.config.ollama_url;
      process.env.ANTHROPIC_API_KEY = '';
    }

    // Create instructions file for Claude Code
    const instructionsPath = path.join(process.cwd(), '.mehaisi', 'temp', `${options.agentId}-instructions.md`);
    await fs.ensureDir(path.dirname(instructionsPath));

    let instructions = agentConfig.instructions;

    // Add progress reporting instructions
    instructions += `\n\n## PROGRESS REPORTING PROTOCOL\nYou MUST report progress every 2 minutes:\n\n1. **Phase Updates**: When starting a new investigation phase\n   \`\`\`\n   PROGRESS: Starting Phase 1 - Discovery\n   STATUS: Scanning for HTTP clients...\n   FILES_FOUND: 0\n   \`\`\`\n\n2. **Finding Updates**: When discovering issues\n   \`\`\`\n   PROGRESS: Analyzing endpoints\n   STATUS: Found 3 API calls in src/api/users.js\n   ISSUES_FOUND: 2\n   \`\`\`\n\n3. **Completion**: When investigation is complete\n   \`\`\`\n   PROGRESS: Investigation complete\n   STATUS: Analyzed 15 files, found 8 issues\n   FILES_ANALYZED: 15\n   ISSUES_TOTAL: 8\n   \`\`\`\n`;

    // Add coordination context if enabled
    if (agentConfig.coordination?.enabled && options.coordinationHub) {
      instructions += await this.buildCoordinationContext(options.coordinationHub, options.agentId, agentConfig);
    }

    await fs.writeFile(instructionsPath, instructions);

    // Run Claude Code with timeout and error handling
    try {
      const timeout = this.config.agent_timeout || 600000; // 10 minutes default
      const output = await this.executeWithTimeout(agentConfig, instructionsPath, options.agentId, timeout, options);

      if (!output || output.trim() === '') {
        throw new Error('Agent produced no output');
      }

      console.log(chalk.green(`${ui.icons.check} Agent completed\n`));

      // Parse output and extract findings
      const result = this.parseAgentOutput(output, agentConfig);

      // Share findings via coordination hub
      if (agentConfig.coordination?.enabled && options.coordinationHub) {
        await this.shareCoordinationData(options.coordinationHub, options.agentId, result, agentConfig);
      }

      return result;


    } catch (error) {
      ui.error(`Agent failed: ${error.message}`, true);

      // Capture full error context
      const errorDetails = {
        message: error.message,
        stack: error.stack,
        agentName,
        timestamp: new Date().toISOString()
      };

      // Save error log
      const errorPath = path.join(process.cwd(), '.mehaisi', 'temp', `${options.agentId}-error.json`);
      await fs.writeJSON(errorPath, errorDetails, { spaces: 2 }).catch(e => {
        console.error(chalk.red(`Failed to save error log: ${e.message}`));
      });

      throw error;
    } finally {
      await fs.remove(instructionsPath);
      if (options.agentId) {
        this.runningProcesses.delete(options.agentId);
      }
    }
  }

  /**
   * Execute agent with timeout protection using provider layer
   */
  async executeWithTimeout(agentConfig, instructionsPath, agentId, timeout, runtimeOptions = {}) {
    // Read instructions
    const instructions = await fs.readFile(instructionsPath, 'utf8');

    // Use ModelResolver for intelligent model and provider selection
    const executionContext = this.modelResolver.getExecutionContext(agentConfig, runtimeOptions);
    
    // Display resolution info in verbose mode
    if (process.env.MEHAISI_VERBOSE || runtimeOptions.verbose) {
      this.modelResolver.displayResolutionInfo(agentConfig, runtimeOptions);
    }

    try {
      // Execute using provider manager with resolved context
      const result = await this.providerManager.execute(instructions, {
        provider: executionContext.provider,
        model: executionContext.model,
        timeout,
        agentId,
        workingDir: process.cwd()
      });

      // Extract output from provider result (flexible to different provider formats)
      if (typeof result === 'string') return result;
      return result.output || result.response || result.content || result.text || result;
    } catch (error) {
      // Re-throw with more context
      throw new Error(`Provider ${providerName} failed: ${error.message}`);
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
