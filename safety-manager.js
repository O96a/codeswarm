const { execSync } = require('child_process');
const fs = require('fs-extra');

class SafetyManager {
  constructor(config) {
    this.config = config;
  }

  async runPreflightChecks() {
    // Check Git
    try { execSync('git --version', { stdio: 'ignore' }); } 
    catch { throw new Error('Git not installed'); }

    // Check Ollama
    try { execSync('ollama --version', { stdio: 'ignore' }); }
    catch { throw new Error('Ollama not installed'); }

    // Check Claude Code
    try { execSync('claude --version', { stdio: 'ignore' }); }
    catch { throw new Error('Claude Code not installed'); }

    return true;
  }

  async runTests() {
    const testCommand = this.config.project_context?.test_command || 'npm test';
    try {
      execSync(testCommand, { stdio: 'inherit' });
      return true;
    } catch {
      throw new Error('Tests failed');
    }
  }
}

module.exports = SafetyManager;
