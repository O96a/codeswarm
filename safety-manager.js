const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

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

  detectProjectType() {
    const cwd = process.cwd();

    // Check for various project types
    if (fs.existsSync(path.join(cwd, 'package.json'))) {
      const pkg = fs.readJSONSync(path.join(cwd, 'package.json'));
      if (pkg.scripts?.test) return { type: 'node', testCommand: 'npm test' };
      return { type: 'node', testCommand: null };
    }

    if (fs.existsSync(path.join(cwd, 'requirements.txt')) ||
        fs.existsSync(path.join(cwd, 'pyproject.toml'))) {
      if (fs.existsSync(path.join(cwd, 'pytest.ini')) ||
          fs.existsSync(path.join(cwd, 'setup.cfg'))) {
        return { type: 'python', testCommand: 'pytest' };
      }
      return { type: 'python', testCommand: null };
    }

    if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) {
      return { type: 'rust', testCommand: 'cargo test' };
    }

    if (fs.existsSync(path.join(cwd, 'go.mod'))) {
      return { type: 'go', testCommand: 'go test ./...' };
    }

    // Docker-compose projects - check for nested test frameworks
    if (fs.existsSync(path.join(cwd, 'docker-compose.yml')) ||
        fs.existsSync(path.join(cwd, 'compose.yaml'))) {
      // Check if there's also a package.json with test script (Node.js in Docker)
      if (fs.existsSync(path.join(cwd, 'package.json'))) {
        const pkg = fs.readJSONSync(path.join(cwd, 'package.json'));
        if (pkg.scripts?.test && !pkg.scripts.test.includes('echo')) {
          return { type: 'docker-node', testCommand: pkg.scripts.test };
        }
      }
      // Check for Python in Docker
      if (fs.existsSync(path.join(cwd, 'requirements.txt')) &&
          (fs.existsSync(path.join(cwd, 'pytest.ini')) || fs.existsSync(path.join(cwd, 'tests')))) {
        return { type: 'docker-python', testCommand: 'pytest' };
      }
      // No detectable tests in Docker project
      return { type: 'docker', testCommand: null };
    }

    return { type: 'unknown', testCommand: null };
  }

  async runTests() {
    // Skip tests if explicitly disabled
    if (this.config.safety?.require_tests === false) {
      console.log('ℹ Tests skipped (require_tests: false)');
      return true;
    }

    // Get configured test command or auto-detect
    let testCommand = this.config.project_context?.test_command;

    if (!testCommand || testCommand === 'npm test') {
      const detected = this.detectProjectType();

      if (!detected.testCommand) {
        console.log(`ℹ No test suite detected for ${detected.type} project. Skipping tests.`);
        return true;
      }

      testCommand = detected.testCommand;
    }

    // Check if test command is a no-op placeholder
    if (testCommand.includes('echo') || testCommand.includes('true')) {
      console.log(`ℹ Test command is placeholder: "${testCommand}". Skipping.`);
      return true;
    }

    try {
      console.log(`🧪 Running tests: ${testCommand}`);
      execSync(testCommand, { stdio: 'inherit' });
      console.log('✓ Tests passed');
      return true;
    } catch (error) {
      if (this.config.safety?.rollback_on_failure !== false) {
        throw new Error('Tests failed');
      }
      console.warn('⚠ Tests failed but rollback_on_failure is disabled');
      return false;
    }
  }
}

module.exports = SafetyManager;
