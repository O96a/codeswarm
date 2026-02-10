const { execSync, spawnSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

// ─── Test Failure Categories ───────────────────────────────────────────────────
const FAILURE_CATEGORY = {
  ENVIRONMENT_ERROR:    'environment_error',    // Config, env vars, pydantic validation
  IMPORT_ERROR:         'import_error',         // Module import / conftest loading
  COLLECTION_ERROR:     'collection_error',     // Pytest collection (exit 4/5)
  DEPENDENCY_ERROR:     'dependency_error',     // Missing packages, version conflicts
  SYNTAX_ERROR:         'syntax_error',         // Code syntax errors
  INFRASTRUCTURE_ERROR: 'infrastructure_error', // DB, network, service unavailable
  PERMISSION_ERROR:     'permission_error',     // File permission, access denied
  TEST_FAILURE:         'test_failure',         // Actual assertion failures
  TIMEOUT_ERROR:        'timeout_error',        // Test timeout / hang
  UNKNOWN:              'unknown',              // Unclassifiable
};

// ─── Test Failure Analyzer ─────────────────────────────────────────────────────
// Parses captured test output and classifies the failure into actionable categories
// so the system can decide how to respond (remediate, retry, rollback, or skip).

class TestFailureAnalyzer {

  /**
   * Analyze captured test output and return a structured diagnosis.
   * @param {string} stdout  - Captured stdout from the test run
   * @param {string} stderr  - Captured stderr from the test run
   * @param {number} exitCode - Process exit code
   * @returns {{ category: string, summary: string, details: object, remediation: string|null }}
   */
  static analyze(stdout, stderr, exitCode) {
    const combined = `${stdout}\n${stderr}`;
    const lines = combined.split('\n');

    // Run all classifiers and pick the best match
    const classifiers = [
      TestFailureAnalyzer._checkPydanticValidation,
      TestFailureAnalyzer._checkExtraEnvVars,
      TestFailureAnalyzer._checkMissingEnvVars,
      TestFailureAnalyzer._checkImportErrors,
      TestFailureAnalyzer._checkModuleNotFound,
      TestFailureAnalyzer._checkDependencyConflicts,
      TestFailureAnalyzer._checkSyntaxErrors,
      TestFailureAnalyzer._checkPermissionErrors,
      TestFailureAnalyzer._checkInfrastructureErrors,
      TestFailureAnalyzer._checkTimeoutErrors,
      TestFailureAnalyzer._checkCollectionErrors,
      TestFailureAnalyzer._checkAssertionFailures,
    ];

    for (const classifier of classifiers) {
      const result = classifier(combined, lines, exitCode);
      if (result) return result;
    }

    // Fallback: try to determine category from exit code alone
    return TestFailureAnalyzer._classifyByExitCode(exitCode, combined);
  }

  // ── Pydantic validation errors (the exact issue we hit) ────────────────────
  static _checkPydanticValidation(text) {
    // Match: "Extra inputs are not permitted", "field required", "value_error", etc.
    const pydanticMatch = text.match(
      /pydantic[_.]core[._].*?ValidationError:\s*(\d+)\s*validation\s*error[s]?\s*for\s*(\w+)/i
    );
    if (!pydanticMatch) return null;

    const errorCount = parseInt(pydanticMatch[1], 10);
    const modelName = pydanticMatch[2];
    const extraFields = [];
    const missingFields = [];
    const otherIssues = [];

    // Extract specific field errors
    const extraRe = /^(\w+)\s*\n\s*Extra inputs are not permitted/gm;
    const missingRe = /^(\w+)\s*\n\s*(?:Field required|field required)/gm;
    const genericRe = /^(\w+)\s*\n\s*(.+?)\s*\[type=(\w+)/gm;

    let m;
    while ((m = extraRe.exec(text))) extraFields.push(m[1]);
    while ((m = missingRe.exec(text))) missingFields.push(m[1]);
    while ((m = genericRe.exec(text))) {
      if (!extraFields.includes(m[1]) && !missingFields.includes(m[1])) {
        otherIssues.push({ field: m[1], message: m[2], type: m[3] });
      }
    }

    // Build remediation strategy
    let remediation = null;
    if (extraFields.length > 0) {
      remediation = 'strip_env_vars';
    } else if (missingFields.length > 0) {
      remediation = 'add_env_vars';
    }

    return {
      category: FAILURE_CATEGORY.ENVIRONMENT_ERROR,
      summary: `Pydantic ${modelName} validation failed: ${errorCount} error(s). ` +
        (extraFields.length ? `Extra fields: ${extraFields.join(', ')}. ` : '') +
        (missingFields.length ? `Missing fields: ${missingFields.join(', ')}.` : ''),
      details: { modelName, errorCount, extraFields, missingFields, otherIssues },
      remediation,
    };
  }

  // ── Extra environment variables (broader than Pydantic) ────────────────────
  static _checkExtraEnvVars(text) {
    if (/Extra inputs are not permitted/i.test(text) && !/ValidationError/i.test(text)) {
      const fieldMatch = text.match(/^\s*(\w+)\s*\n\s*Extra inputs are not permitted/m);
      return {
        category: FAILURE_CATEGORY.ENVIRONMENT_ERROR,
        summary: `Extra input not permitted${fieldMatch ? `: ${fieldMatch[1]}` : ''}`,
        details: { field: fieldMatch?.[1] },
        remediation: 'strip_env_vars',
      };
    }
    return null;
  }

  // ── Missing environment variables ──────────────────────────────────────────
  static _checkMissingEnvVars(text) {
    const patterns = [
      /(?:KeyError|Missing):\s*['"]?(\w+)['"]?/i,
      /environment variable ['"]?(\w+)['"]? (?:not set|is required|missing)/i,
      /required environment variable/i,
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m) {
        return {
          category: FAILURE_CATEGORY.ENVIRONMENT_ERROR,
          summary: `Missing environment variable: ${m[1] || 'unknown'}`,
          details: { missingVar: m[1] },
          remediation: 'add_env_vars',
        };
      }
    }
    return null;
  }

  // ── Import errors (conftest chain, module loading) ─────────────────────────
  static _checkImportErrors(text) {
    const importMatch = text.match(
      /ImportError.*?loading conftest\s+['"]?([^'".\n]+)/i
    ) || text.match(
      /ImportError:\s*(?:cannot import name ['"](\w+)['"]|No module named ['"]([^'"]+)['"])/i
    );

    if (!importMatch) return null;

    // Try to trace the import chain
    const chainMatches = [...text.matchAll(/^(\S+\.py):(\d+):\s*in\s+(\S+)\s*\n\s+(.+)$/gm)];
    const importChain = chainMatches.map(m => ({
      file: m[1], line: parseInt(m[2], 10), scope: m[3], code: m[4].trim()
    }));

    // Identify the root cause module
    const moduleMatch = text.match(/No module named ['"]([^'"]+)['"]/i) ||
      text.match(/from\s+(\S+)\s+import/m);

    return {
      category: FAILURE_CATEGORY.IMPORT_ERROR,
      summary: `Import error in conftest/module chain: ${importMatch[1] || importMatch[2] || 'unknown'}`,
      details: { importChain, rootModule: moduleMatch?.[1] },
      remediation: 'fix_imports',
    };
  }

  // ── Module not found (pip / npm package missing) ───────────────────────────
  static _checkModuleNotFound(text) {
    const pyMatch = text.match(/ModuleNotFoundError:\s*No module named ['"]([^'"]+)['"]/i);
    if (pyMatch) {
      return {
        category: FAILURE_CATEGORY.DEPENDENCY_ERROR,
        summary: `Python module not found: ${pyMatch[1]}`,
        details: { language: 'python', module: pyMatch[1] },
        remediation: 'install_dependency',
      };
    }
    const nodeMatch = text.match(/Error:\s*Cannot find module ['"]([^'"]+)['"]/i);
    if (nodeMatch) {
      return {
        category: FAILURE_CATEGORY.DEPENDENCY_ERROR,
        summary: `Node module not found: ${nodeMatch[1]}`,
        details: { language: 'node', module: nodeMatch[1] },
        remediation: 'install_dependency',
      };
    }
    return null;
  }

  // ── Dependency version conflicts ──────────────────────────────────────────
  static _checkDependencyConflicts(text) {
    if (/(?:version conflict|incompatible|requires\s+\S+\s+but\s+\S+\s+is installed)/i.test(text)) {
      return {
        category: FAILURE_CATEGORY.DEPENDENCY_ERROR,
        summary: 'Dependency version conflict detected',
        details: {},
        remediation: 'resolve_dependencies',
      };
    }
    return null;
  }

  // ── Syntax errors ─────────────────────────────────────────────────────────
  static _checkSyntaxErrors(text) {
    if (/SyntaxError:/i.test(text) || /IndentationError:/i.test(text)) {
      const fileMatch = text.match(/File\s+"([^"]+)",\s+line\s+(\d+)/i);
      return {
        category: FAILURE_CATEGORY.SYNTAX_ERROR,
        summary: `Syntax error${fileMatch ? ` in ${fileMatch[1]}:${fileMatch[2]}` : ''}`,
        details: { file: fileMatch?.[1], line: fileMatch?.[2] },
        remediation: null,  // agent must fix this
      };
    }
    return null;
  }

  // ── Permission errors ─────────────────────────────────────────────────────
  static _checkPermissionErrors(text) {
    if (/PermissionError:|Permission denied|EACCES/i.test(text)) {
      return {
        category: FAILURE_CATEGORY.PERMISSION_ERROR,
        summary: 'Permission denied during test execution',
        details: {},
        remediation: 'fix_permissions',
      };
    }
    return null;
  }

  // ── Infrastructure errors (DB, network, services) ─────────────────────────
  static _checkInfrastructureErrors(text) {
    const patterns = [
      { re: /(?:Connection refused|ECONNREFUSED|could not connect)/i, type: 'connection' },
      { re: /(?:OperationalError|psycopg2|mysql|sqlite3\.OperationalError)/i, type: 'database' },
      { re: /(?:redis\.exceptions|ConnectionError.*?redis)/i, type: 'redis' },
      { re: /(?:ENOTFOUND|getaddrinfo|DNS)/i, type: 'dns' },
      { re: /(?:ServiceUnavailable|503|502|504)/i, type: 'service' },
    ];
    for (const { re, type } of patterns) {
      if (re.test(text)) {
        return {
          category: FAILURE_CATEGORY.INFRASTRUCTURE_ERROR,
          summary: `Infrastructure issue: ${type} error`,
          details: { infraType: type },
          remediation: 'skip_or_retry',
        };
      }
    }
    return null;
  }

  // ── Timeout errors ────────────────────────────────────────────────────────
  static _checkTimeoutErrors(text) {
    if (/(?:TimeoutError|timed?\s*out|ETIMEDOUT|deadline exceeded)/i.test(text)) {
      return {
        category: FAILURE_CATEGORY.TIMEOUT_ERROR,
        summary: 'Test execution timed out',
        details: {},
        remediation: 'increase_timeout',
      };
    }
    return null;
  }

  // ── Test collection errors (pytest exit code 4-5) ─────────────────────────
  static _checkCollectionErrors(text, _lines, exitCode) {
    if (exitCode === 4 || exitCode === 5 ||
        /no tests ran|collected 0 items|no tests were selected/i.test(text)) {
      return {
        category: FAILURE_CATEGORY.COLLECTION_ERROR,
        summary: 'Test collection failed — no tests could be gathered',
        details: { exitCode },
        remediation: 'fix_collection',
      };
    }
    return null;
  }

  // ── Actual test assertion failures ────────────────────────────────────────
  static _checkAssertionFailures(text, _lines, exitCode) {
    const failedMatch = text.match(/(\d+)\s+(?:failed|error)/i);
    const passedMatch = text.match(/(\d+)\s+passed/i);
    if (failedMatch || exitCode === 1) {
      return {
        category: FAILURE_CATEGORY.TEST_FAILURE,
        summary: `Test assertions failed: ${failedMatch?.[1] || '?'} failures` +
          (passedMatch ? `, ${passedMatch[1]} passed` : ''),
        details: {
          failed: parseInt(failedMatch?.[1] || '0', 10),
          passed: parseInt(passedMatch?.[1] || '0', 10),
        },
        remediation: null,  // agent must fix the code
      };
    }
    return null;
  }

  // ── Fallback classification by exit code ──────────────────────────────────
  static _classifyByExitCode(exitCode, text) {
    const tailLines = text.split('\n').filter(l => l.trim()).slice(-10).join('\n');
    switch (exitCode) {
      case 1: return { category: FAILURE_CATEGORY.TEST_FAILURE,      summary: 'Tests failed (assertion errors)', details: {}, remediation: null };
      case 2: return { category: FAILURE_CATEGORY.SYNTAX_ERROR,      summary: 'Test execution interrupted or syntax error', details: {}, remediation: null };
      case 3: return { category: FAILURE_CATEGORY.UNKNOWN,           summary: 'Internal test runner error', details: {}, remediation: null };
      case 4: return { category: FAILURE_CATEGORY.COLLECTION_ERROR,  summary: 'Test collection error (no tests gathered)', details: {}, remediation: 'fix_collection' };
      case 5: return { category: FAILURE_CATEGORY.COLLECTION_ERROR,  summary: 'No tests found to run', details: {}, remediation: null };
      default:
        return {
          category: FAILURE_CATEGORY.UNKNOWN,
          summary: `Tests failed with exit code ${exitCode}`,
          details: { tailLines },
          remediation: null,
        };
    }
  }
}

// ─── Test Remediator ───────────────────────────────────────────────────────────
// Attempts automatic fixes for known failure categories before re-running tests.

class TestRemediator {

  /**
   * Attempt to remediate a test failure and optionally re-run.
   * Returns { success: boolean, action: string, modifiedEnv?: object }
   */
  static remediate(diagnosis, testCommand, config) {
    const strategy = diagnosis.remediation;
    if (!strategy) return { success: false, action: 'none', reason: 'No remediation strategy available' };

    switch (strategy) {
      case 'strip_env_vars':
        return TestRemediator._stripEnvVars(diagnosis, testCommand);
      case 'add_env_vars':
        return TestRemediator._suggestEnvVars(diagnosis);
      case 'install_dependency':
        return TestRemediator._installDependency(diagnosis, testCommand);
      case 'fix_permissions':
        return TestRemediator._fixPermissions(diagnosis);
      case 'skip_or_retry':
        return { success: true, action: 'retry', reason: 'Infrastructure issue — may be transient' };
      case 'increase_timeout':
        return { success: true, action: 'retry_with_timeout', reason: 'Increasing timeout for re-run' };
      default:
        return { success: false, action: 'none', reason: `Unknown strategy: ${strategy}` };
    }
  }

  /**
   * Build a sanitized env that strips offending extra variables
   * (e.g. cloudflare_tunnel_token for Pydantic models that forbid extras).
   */
  static _stripEnvVars(diagnosis, testCommand) {
    const extraFields = diagnosis.details?.extraFields || [];
    if (extraFields.length === 0) {
      // Try to extract from summary
      const m = diagnosis.summary.match(/Extra fields?:\s*(.+?)(?:\.|$)/);
      if (m) extraFields.push(...m[1].split(',').map(s => s.trim()));
    }

    if (extraFields.length === 0) {
      return { success: false, action: 'none', reason: 'Could not identify which env vars to strip' };
    }

    // Build a sanitized copy of process.env, removing the problematic vars
    // Case-insensitive matching since env vars may differ in case from Pydantic field names
    const envLower = {};
    for (const key of Object.keys(process.env)) {
      envLower[key.toLowerCase()] = key;
    }

    const strippedKeys = [];
    const sanitizedEnv = { ...process.env };
    for (const field of extraFields) {
      const actualKey = envLower[field.toLowerCase()];
      if (actualKey && actualKey in sanitizedEnv) {
        delete sanitizedEnv[actualKey];
        strippedKeys.push(actualKey);
      } else {
        // The field might be set via .env file, not process.env — we need a different approach
        // We'll set it to empty or use env -u
        strippedKeys.push(field);
      }
    }

    return {
      success: true,
      action: 'rerun_with_clean_env',
      strippedKeys,
      sanitizedEnv,
      reason: `Stripped env vars: ${strippedKeys.join(', ')}`,
    };
  }

  static _suggestEnvVars(diagnosis) {
    const missing = diagnosis.details?.missingFields || diagnosis.details?.missingVar;
    return {
      success: false,
      action: 'manual',
      reason: `Missing env var(s): ${Array.isArray(missing) ? missing.join(', ') : missing}. Add them to .env or environment.`,
    };
  }

  static _installDependency(diagnosis) {
    const { language, module: mod } = diagnosis.details || {};
    if (!mod) return { success: false, action: 'none', reason: 'Could not identify missing module' };

    try {
      if (language === 'python') {
        // Try to install in the project's venv
        const venvDirs = ['venv', '.venv', 'env', '.env'];
        let pip = 'pip3';
        for (const v of venvDirs) {
          const venvPip = path.join(process.cwd(), v, 'bin', 'pip');
          if (fs.existsSync(venvPip)) { pip = venvPip; break; }
        }
        console.log(chalk.yellow(`  🔧 Auto-installing missing Python module: ${mod}`));
        execSync(`${pip} install ${mod}`, { stdio: 'pipe', timeout: 60000 });
        return { success: true, action: 'installed_dependency', reason: `Installed Python module: ${mod}` };
      } else if (language === 'node') {
        console.log(chalk.yellow(`  🔧 Auto-installing missing Node module: ${mod}`));
        execSync(`npm install ${mod}`, { stdio: 'pipe', timeout: 60000 });
        return { success: true, action: 'installed_dependency', reason: `Installed Node module: ${mod}` };
      }
    } catch (err) {
      return { success: false, action: 'install_failed', reason: `Failed to install ${mod}: ${err.message}` };
    }
    return { success: false, action: 'none', reason: `Unsupported language: ${language}` };
  }

  static _fixPermissions(diagnosis) {
    // Not safe to auto-fix permissions; flag for manual resolution
    return {
      success: false,
      action: 'manual',
      reason: 'Permission errors require manual investigation',
    };
  }
}

// ─── Language / framework detectors ────────────────────────────────────────────
// Each detector receives an absolute directory path and returns
// { type, testCommand } or null if it doesn't match.
// "testCommand" is null when the language is detected but no test setup is found.

const PROJECT_DETECTORS = [

  // ── Node.js / JavaScript / TypeScript ──────────────────────────────────────
  {
    type: 'node',
    detect(dir) {
      const pkgPath = path.join(dir, 'package.json');
      if (!fs.existsSync(pkgPath)) return null;
      try {
        const pkg = fs.readJSONSync(pkgPath);
        const testScript = pkg.scripts?.test;
        if (testScript && !_isNoopScript(testScript)) {
          return { type: 'node', testCommand: 'npm test' };
        }
        // Even without a test script, check for common test dirs / config
        if (_hasAny(dir, ['jest.config.js', 'jest.config.ts', 'jest.config.mjs',
            'vitest.config.ts', 'vitest.config.js', '.mocharc.yml', '.mocharc.json',
            'cypress.config.js', 'cypress.config.ts', 'playwright.config.ts',
            'playwright.config.js', 'karma.conf.js',
            '__tests__', 'test', 'tests', 'spec'])) {
          return { type: 'node', testCommand: 'npx jest --passWithNoTests' };
        }
        return { type: 'node', testCommand: null };
      } catch { return null; }
    }
  },

  // ── Deno ───────────────────────────────────────────────────────────────────
  {
    type: 'deno',
    detect(dir) {
      if (!_hasAny(dir, ['deno.json', 'deno.jsonc', 'deno.lock'])) return null;
      return { type: 'deno', testCommand: 'deno test' };
    }
  },

  // ── Bun ────────────────────────────────────────────────────────────────────
  {
    type: 'bun',
    detect(dir) {
      if (!fs.existsSync(path.join(dir, 'bun.lockb')) &&
          !fs.existsSync(path.join(dir, 'bunfig.toml'))) return null;
      const pkgPath = path.join(dir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = fs.readJSONSync(pkgPath);
          if (pkg.scripts?.test && !_isNoopScript(pkg.scripts.test)) {
            return { type: 'bun', testCommand: 'bun test' };
          }
        } catch {}
      }
      if (_hasAny(dir, ['__tests__', 'tests', 'test'])) {
        return { type: 'bun', testCommand: 'bun test' };
      }
      return { type: 'bun', testCommand: null };
    }
  },

  // ── Python ─────────────────────────────────────────────────────────────────
  {
    type: 'python',
    detect(dir) {
      if (!_hasAny(dir, ['requirements.txt', 'pyproject.toml', 'setup.py',
          'setup.cfg', 'Pipfile', 'poetry.lock', 'tox.ini'])) return null;
      // Check for test infrastructure
      if (_hasAny(dir, ['pytest.ini', 'setup.cfg', 'tox.ini', 'pyproject.toml',
          'tests', 'test', '.pytest_cache', 'conftest.py'])) {
        const pytestCmd = _buildPythonTestCommand(dir);
        return { type: 'python', testCommand: pytestCmd };
      }
      return { type: 'python', testCommand: null };
    }
  },

  // ── Go ─────────────────────────────────────────────────────────────────────
  {
    type: 'go',
    detect(dir) {
      if (!fs.existsSync(path.join(dir, 'go.mod'))) return null;
      return { type: 'go', testCommand: 'go test ./...' };
    }
  },

  // ── Rust ───────────────────────────────────────────────────────────────────
  {
    type: 'rust',
    detect(dir) {
      if (!fs.existsSync(path.join(dir, 'Cargo.toml'))) return null;
      return { type: 'rust', testCommand: 'cargo test' };
    }
  },

  // ── Java (Maven) ──────────────────────────────────────────────────────────
  {
    type: 'java-maven',
    detect(dir) {
      if (!fs.existsSync(path.join(dir, 'pom.xml'))) return null;
      const hasTests = _hasAny(dir, ['src/test']) ||
        fs.existsSync(path.join(dir, 'src', 'test'));
      return { type: 'java-maven', testCommand: hasTests ? 'mvn test' : null };
    }
  },

  // ── Java / Kotlin (Gradle) ────────────────────────────────────────────────
  {
    type: 'java-gradle',
    detect(dir) {
      if (!_hasAny(dir, ['build.gradle', 'build.gradle.kts'])) return null;
      const wrapper = fs.existsSync(path.join(dir, 'gradlew')) ? './gradlew' : 'gradle';
      const hasTests = fs.existsSync(path.join(dir, 'src', 'test'));
      return { type: 'java-gradle', testCommand: hasTests ? `${wrapper} test` : null };
    }
  },

  // ── .NET / C# ─────────────────────────────────────────────────────────────
  {
    type: 'dotnet',
    detect(dir) {
      const hasSln = _globMatch(dir, '*.sln');
      const hasCsproj = _globMatch(dir, '*.csproj');
      const hasFsproj = _globMatch(dir, '*.fsproj');
      if (!hasSln && !hasCsproj && !hasFsproj) return null;
      return { type: 'dotnet', testCommand: 'dotnet test' };
    }
  },

  // ── PHP ────────────────────────────────────────────────────────────────────
  {
    type: 'php',
    detect(dir) {
      if (!fs.existsSync(path.join(dir, 'composer.json'))) return null;
      if (_hasAny(dir, ['phpunit.xml', 'phpunit.xml.dist', 'tests', 'test'])) {
        const vendor = fs.existsSync(path.join(dir, 'vendor', 'bin', 'phpunit'));
        return { type: 'php', testCommand: vendor ? 'vendor/bin/phpunit' : 'phpunit' };
      }
      // Check composer.json scripts
      try {
        const composer = fs.readJSONSync(path.join(dir, 'composer.json'));
        if (composer.scripts?.test) {
          return { type: 'php', testCommand: 'composer test' };
        }
      } catch {}
      return { type: 'php', testCommand: null };
    }
  },

  // ── Ruby ───────────────────────────────────────────────────────────────────
  {
    type: 'ruby',
    detect(dir) {
      if (!_hasAny(dir, ['Gemfile', 'Rakefile', '*.gemspec'])) {
        if (!_globMatch(dir, '*.gemspec')) return null;
      }
      if (_hasAny(dir, ['spec', '.rspec', 'test', 'Rakefile'])) {
        if (fs.existsSync(path.join(dir, 'spec')) || fs.existsSync(path.join(dir, '.rspec'))) {
          return { type: 'ruby', testCommand: 'bundle exec rspec' };
        }
        if (fs.existsSync(path.join(dir, 'test'))) {
          return { type: 'ruby', testCommand: 'bundle exec rake test' };
        }
      }
      return { type: 'ruby', testCommand: null };
    }
  },

  // ── Elixir ─────────────────────────────────────────────────────────────────
  {
    type: 'elixir',
    detect(dir) {
      if (!fs.existsSync(path.join(dir, 'mix.exs'))) return null;
      return { type: 'elixir', testCommand: 'mix test' };
    }
  },

  // ── Dart / Flutter ─────────────────────────────────────────────────────────
  {
    type: 'dart',
    detect(dir) {
      if (!fs.existsSync(path.join(dir, 'pubspec.yaml'))) return null;
      const isFlutter = fs.existsSync(path.join(dir, 'lib')) &&
        (fs.existsSync(path.join(dir, 'android')) || fs.existsSync(path.join(dir, 'ios')));
      if (fs.existsSync(path.join(dir, 'test'))) {
        return { type: isFlutter ? 'flutter' : 'dart',
          testCommand: isFlutter ? 'flutter test' : 'dart test' };
      }
      return { type: isFlutter ? 'flutter' : 'dart', testCommand: null };
    }
  },

  // ── Swift (SPM) ────────────────────────────────────────────────────────────
  {
    type: 'swift',
    detect(dir) {
      if (!fs.existsSync(path.join(dir, 'Package.swift'))) return null;
      return { type: 'swift', testCommand: 'swift test' };
    }
  },

  // ── Scala (SBT) ───────────────────────────────────────────────────────────
  {
    type: 'scala',
    detect(dir) {
      if (!fs.existsSync(path.join(dir, 'build.sbt'))) return null;
      return { type: 'scala', testCommand: 'sbt test' };
    }
  },

  // ── Haskell ────────────────────────────────────────────────────────────────
  {
    type: 'haskell',
    detect(dir) {
      if (_hasAny(dir, ['stack.yaml'])) return { type: 'haskell', testCommand: 'stack test' };
      if (_globMatch(dir, '*.cabal')) return { type: 'haskell', testCommand: 'cabal test' };
      return null;
    }
  },

  // ── Zig ────────────────────────────────────────────────────────────────────
  {
    type: 'zig',
    detect(dir) {
      if (!fs.existsSync(path.join(dir, 'build.zig'))) return null;
      return { type: 'zig', testCommand: 'zig build test' };
    }
  },

  // ── Clojure ────────────────────────────────────────────────────────────────
  {
    type: 'clojure',
    detect(dir) {
      if (_hasAny(dir, ['project.clj', 'deps.edn'])) {
        if (fs.existsSync(path.join(dir, 'project.clj'))) {
          return { type: 'clojure', testCommand: 'lein test' };
        }
        return { type: 'clojure', testCommand: 'clj -X:test' };
      }
      return null;
    }
  },

  // ── C / C++ (CMake) ───────────────────────────────────────────────────────
  {
    type: 'cmake',
    detect(dir) {
      if (!fs.existsSync(path.join(dir, 'CMakeLists.txt'))) return null;
      if (_hasAny(dir, ['tests', 'test'])) {
        return { type: 'cmake', testCommand: 'cmake --build build && ctest --test-dir build' };
      }
      return { type: 'cmake', testCommand: null };
    }
  },

  // ── C / C++ (Makefile with test target) ───────────────────────────────────
  {
    type: 'make',
    detect(dir) {
      const makefile = path.join(dir, 'Makefile');
      if (!fs.existsSync(makefile)) return null;
      try {
        const content = fs.readFileSync(makefile, 'utf8');
        if (/^test\s*:/m.test(content)) {
          return { type: 'make', testCommand: 'make test' };
        }
      } catch {}
      return { type: 'make', testCommand: null };
    }
  },

  // ── R ──────────────────────────────────────────────────────────────────────
  {
    type: 'r',
    detect(dir) {
      if (!fs.existsSync(path.join(dir, 'DESCRIPTION'))) return null;
      if (_hasAny(dir, ['tests', 'testthat'])) {
        return { type: 'r', testCommand: 'Rscript -e "devtools::test()"' };
      }
      return { type: 'r', testCommand: null };
    }
  },

  // ── Lua (Busted) ──────────────────────────────────────────────────────────
  {
    type: 'lua',
    detect(dir) {
      if (!_globMatch(dir, '*.rockspec') &&
          !fs.existsSync(path.join(dir, '.busted'))) return null;
      if (_hasAny(dir, ['spec', 'test', 'tests', '.busted'])) {
        return { type: 'lua', testCommand: 'busted' };
      }
      return { type: 'lua', testCommand: null };
    }
  },

  // ── Terraform ──────────────────────────────────────────────────────────────
  {
    type: 'terraform',
    detect(dir) {
      if (!_globMatch(dir, '*.tf')) return null;
      if (_hasAny(dir, ['tests', 'test'])) {
        return { type: 'terraform', testCommand: 'terraform test' };
      }
      return { type: 'terraform', testCommand: null };
    }
  },

  // ── Ansible ────────────────────────────────────────────────────────────────
  {
    type: 'ansible',
    detect(dir) {
      if (!_hasAny(dir, ['ansible.cfg', 'playbooks', 'roles'])) return null;
      if (_hasAny(dir, ['molecule', 'tests'])) {
        return { type: 'ansible', testCommand: 'molecule test' };
      }
      return { type: 'ansible', testCommand: null };
    }
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Check if any of the given names exist as files/dirs inside `dir` */
function _hasAny(dir, names) {
  return names.some(n => fs.existsSync(path.join(dir, n)));
}

/** Simple glob: check if any file in `dir` (non-recursive) matches a pattern like "*.ext" */
function _globMatch(dir, pattern) {
  if (!pattern.startsWith('*')) return fs.existsSync(path.join(dir, pattern));
  const ext = pattern.slice(1); // e.g. ".sln"
  try {
    return fs.readdirSync(dir).some(f => f.endsWith(ext));
  } catch { return false; }
}

/** Returns true if a test script is a no-op placeholder */
function _isNoopScript(script) {
  if (!script) return true;
  const s = script.trim().toLowerCase();
  return s.includes('echo') || s === 'exit 0' || s === 'true' ||
    s.startsWith('echo ') || s === 'no test specified' ||
    s.includes('no test') || s === '';
}

/**
 * Resolve the correct Python binary. Checks for a local venv first,
 * then falls back to system python3 / python.
 */
function _resolvePythonBin(dir) {
  // Check for local virtual environment
  const venvDirs = ['venv', '.venv', 'env', '.env'];
  for (const v of venvDirs) {
    const venvPython = path.join(dir, v, 'bin', 'python');
    if (fs.existsSync(venvPython)) {
      return venvPython;
    }
  }
  // Fall back to system python — prefer python3
  try { execSync('python3 --version', { stdio: 'ignore' }); return 'python3'; } catch {}
  try { execSync('python --version', { stdio: 'ignore' }); return 'python'; } catch {}
  return 'python3'; // best guess
}

/**
 * Build the pytest command for a given directory, handling venvs correctly.
 * Always sets PYTHONPATH=. so the project's own modules are importable.
 */
function _buildPythonTestCommand(dir) {
  // Check for local venv with pytest installed
  const venvDirs = ['venv', '.venv', 'env', '.env'];
  for (const v of venvDirs) {
    const venvPytest = path.join(dir, v, 'bin', 'pytest');
    if (fs.existsSync(venvPytest)) {
      return `PYTHONPATH=. ${v}/bin/pytest`;
    }
    const venvPython = path.join(dir, v, 'bin', 'python');
    if (fs.existsSync(venvPython)) {
      return `PYTHONPATH=. ${v}/bin/python -m pytest`;
    }
  }
  // No venv — use system python
  const pyBin = _resolvePythonBin(dir);
  return `PYTHONPATH=. ${pyBin} -m pytest`;
}

// Directories to always skip during recursive scanning
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'venv', '.venv', 'env', '.env',
  '__pycache__', '.pytest_cache', '.mypy_cache', '.tox',
  'dist', 'build', 'out', 'target', 'bin', 'obj',
  '.next', '.nuxt', '.output', '.cache', '.turbo',
  'vendor', 'deps', '_build', 'coverage',
  '.idea', '.vscode', '.mehaisi',
]);


class SafetyManager {
  constructor(config) {
    this.config = config;
    // Stores the baseline test result captured BEFORE agent execution
    this._baselineResult = null;
    // Maximum remediation attempts per test run
    this._maxRemediationAttempts = config.safety?.max_remediation_attempts || 3;
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

  // ─── Baseline Testing ──────────────────────────────────────────────────────
  // Run tests BEFORE agent execution to establish a baseline.
  // If tests already fail, we know the failure is pre-existing.

  /**
   * Capture a baseline test result before any agent runs.
   * This allows us to distinguish agent-caused failures from pre-existing ones.
   * @returns {{ passed: boolean, diagnosis: object|null, output: string }}
   */
  async captureBaseline() {
    if (this.config.safety?.require_tests === false) {
      this._baselineResult = { passed: true, diagnosis: null, output: '', skipped: true };
      return this._baselineResult;
    }

    const testCommand = this._resolveTestCommand();
    if (!testCommand) {
      this._baselineResult = { passed: true, diagnosis: null, output: '', noTests: true };
      return this._baselineResult;
    }

    console.log(chalk.blue('  📋 Capturing test baseline...'));

    const result = this._executeTestsCapture(testCommand);
    if (result.passed) {
      console.log(chalk.green('  ✓ Baseline: all tests pass'));
      this._baselineResult = { passed: true, diagnosis: null, output: result.output };
    } else {
      const diagnosis = TestFailureAnalyzer.analyze(result.stdout, result.stderr, result.exitCode);
      console.log(chalk.yellow(`  ⚠ Baseline: tests already failing — ${diagnosis.summary}`));
      this._baselineResult = { passed: false, diagnosis, output: result.output, exitCode: result.exitCode };
    }

    return this._baselineResult;
  }

  /**
   * Check whether a post-agent test failure is pre-existing (already in baseline).
   * @param {object} currentDiagnosis - Diagnosis from the current (post-agent) failure
   * @returns {boolean}
   */
  isPreExistingFailure(currentDiagnosis) {
    if (!this._baselineResult || this._baselineResult.passed) return false;

    const baseline = this._baselineResult.diagnosis;
    if (!baseline) return false;

    // Same category and similar summary ⇒ pre-existing
    if (baseline.category === currentDiagnosis.category) {
      // For environment errors, compare the specific fields
      if (baseline.category === FAILURE_CATEGORY.ENVIRONMENT_ERROR) {
        const baseExtra = baseline.details?.extraFields || [];
        const currExtra = currentDiagnosis.details?.extraFields || [];
        if (baseExtra.length > 0 && currExtra.length > 0 &&
            baseExtra.every(f => currExtra.includes(f))) {
          return true;
        }
        // Same missing var
        if (baseline.details?.missingVar && baseline.details.missingVar === currentDiagnosis.details?.missingVar) {
          return true;
        }
      }
      // For infra/import/collection errors, the category match is usually enough
      if ([FAILURE_CATEGORY.INFRASTRUCTURE_ERROR, FAILURE_CATEGORY.IMPORT_ERROR,
           FAILURE_CATEGORY.COLLECTION_ERROR, FAILURE_CATEGORY.DEPENDENCY_ERROR,
           FAILURE_CATEGORY.PERMISSION_ERROR].includes(baseline.category)) {
        return true;
      }
    }

    return false;
  }

  // ─── Core detection ────────────────────────────────────────────────────────

  /**
   * Detect the project at `dir` by running every detector.
   * Returns the first match with a testCommand, or the first type-only match,
   * or null if nothing matches.
   */
  _detectAt(dir) {
    let firstTypeOnly = null;

    for (const detector of PROJECT_DETECTORS) {
      try {
        const result = detector.detect(dir);
        if (result) {
          if (result.testCommand) return result; // best: has tests
          if (!firstTypeOnly) firstTypeOnly = result; // remember type-only
        }
      } catch { /* ignore detector errors */ }
    }

    return firstTypeOnly; // may be null
  }

  /**
   * Collect all testable sub-projects by scanning up to `maxDepth` levels.
   * Returns an array of { type, dir (relative), testCommand }.
   */
  _scanSubdirectories(rootDir, maxDepth = 2) {
    const testTargets = [];
    const seen = new Set();

    const scan = (dir, relPath, depth) => {
      if (depth > maxDepth) return;

      const subdirs = this._getSubdirectories(dir);
      for (const sub of subdirs) {
        const absPath = path.join(dir, sub);
        const rel = relPath ? path.join(relPath, sub) : sub;

        // Avoid scanning the same directory twice (symlinks etc.)
        let realPath;
        try { realPath = fs.realpathSync(absPath); } catch { continue; }
        if (seen.has(realPath)) continue;
        seen.add(realPath);

        const detected = this._detectAt(absPath);
        if (detected && detected.testCommand) {
          testTargets.push({
            type: detected.type,
            dir: rel,
            testCommand: `cd ${rel} && ${detected.testCommand}`
          });
          // Don't recurse further into a detected project
          continue;
        }

        // Recurse deeper (e.g. apps/farmer-portal, packages/ui)
        scan(absPath, rel, depth + 1);
      }
    };

    scan(rootDir, '', 0);
    return testTargets;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  detectProjectType() {
    const cwd = process.cwd();

    // Is this a Docker / docker-compose project?
    const isDocker = _hasAny(cwd, [
      'docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml',
      'Dockerfile'
    ]);

    // 1. Try to detect the root project directly
    const rootDetection = this._detectAt(cwd);

    if (rootDetection && rootDetection.testCommand) {
      // Root has tests — but still scan subdirs in case of monorepo
      const subTargets = this._scanSubdirectories(cwd);
      if (subTargets.length > 0) {
        // Combine root + sub tests
        const allTargets = [
          { type: rootDetection.type, dir: '.', testCommand: rootDetection.testCommand },
          ...subTargets
        ];
        const combinedCommand = allTargets.map(t => t.testCommand).join(' && ');
        const types = [...new Set(allTargets.map(t => t.type))].join('+');
        const prefix = isDocker ? 'docker-' : 'monorepo-';
        return { type: `${prefix}${types}`, testCommand: combinedCommand, testTargets: allTargets };
      }
      // Root-only
      const type = isDocker ? `docker-${rootDetection.type}` : rootDetection.type;
      return { type, testCommand: rootDetection.testCommand };
    }

    // 2. Root has no tests (or no detection at all) — scan subdirectories
    const subTargets = this._scanSubdirectories(cwd);

    if (subTargets.length > 0) {
      const combinedCommand = subTargets.map(t => t.testCommand).join(' && ');
      const types = [...new Set(subTargets.map(t => t.type))].join('+');
      const prefix = isDocker ? 'docker-' : 'monorepo-';
      return { type: `${prefix}${types}`, testCommand: combinedCommand, testTargets: subTargets };
    }

    // 3. Return whatever type we found (even without tests) or unknown
    if (rootDetection) {
      const type = isDocker ? `docker-${rootDetection.type}` : rootDetection.type;
      return { type, testCommand: null };
    }

    return { type: isDocker ? 'docker' : 'unknown', testCommand: null };
  }

  _getSubdirectories(dir) {
    try {
      return fs.readdirSync(dir, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('.') && !SKIP_DIRS.has(d.name))
        .map(d => d.name);
    } catch {
      return [];
    }
  }

  async runTests() {
    // Skip tests if explicitly disabled
    if (this.config.safety?.require_tests === false) {
      console.log('ℹ Tests skipped (require_tests: false)');
      return { passed: true, skipped: true };
    }

    const testCommand = this._resolveTestCommand();
    if (!testCommand) {
      return { passed: true, skipped: true, reason: 'no_test_suite' };
    }

    // Check if test command is a no-op placeholder
    if (_isNoopScript(testCommand)) {
      console.log(`ℹ Test command is placeholder: "${testCommand}". Skipping.`);
      return { passed: true, skipped: true, reason: 'noop_script' };
    }

    // ── Run tests with full output capture ─────────────────────────────────
    console.log(`🧪 Running tests: ${testCommand}`);
    let result = this._executeTestsCapture(testCommand);

    if (result.passed) {
      console.log(chalk.green('✓ Tests passed'));
      return { passed: true };
    }

    // ── Tests failed — analyze and attempt remediation ─────────────────────
    const diagnosis = TestFailureAnalyzer.analyze(result.stdout, result.stderr, result.exitCode);

    console.log(chalk.yellow(`\n  🔍 Failure analysis: [${diagnosis.category}] ${diagnosis.summary}`));

    // Check if this is a pre-existing failure (from baseline)
    if (this.isPreExistingFailure(diagnosis)) {
      console.log(chalk.yellow(`  ℹ Pre-existing failure detected (tests were already failing before agent ran)`));
      console.log(chalk.yellow(`  ℹ Agent changes are NOT the cause — skipping rollback`));
      return {
        passed: false,
        preExisting: true,
        diagnosis,
        reason: 'Tests were already failing before the agent ran. This is a pre-existing environment/configuration issue.',
      };
    }

    // ── Attempt auto-remediation ───────────────────────────────────────────
    let attempts = 0;
    while (attempts < this._maxRemediationAttempts) {
      const remediation = TestRemediator.remediate(diagnosis, testCommand, this.config);

      if (!remediation.success) {
        console.log(chalk.gray(`  ℹ No auto-remediation available: ${remediation.reason}`));
        break;
      }

      attempts++;
      console.log(chalk.blue(`  🔧 Remediation attempt ${attempts}: ${remediation.reason}`));

      if (remediation.action === 'rerun_with_clean_env') {
        // Re-run tests with sanitized environment
        console.log(chalk.blue(`  🔄 Re-running tests with sanitized environment (stripped: ${remediation.strippedKeys.join(', ')})`));
        result = this._executeTestsCapture(testCommand, { env: remediation.sanitizedEnv });

        if (result.passed) {
          console.log(chalk.green('  ✓ Tests passed after environment remediation'));
          console.log(chalk.yellow(`  💡 Tip: The following env vars conflict with the project's settings model: ${remediation.strippedKeys.join(', ')}`));
          console.log(chalk.yellow(`     Consider adding them to the Settings model or removing them from the environment.`));
          return { passed: true, remediated: true, action: remediation.action, strippedKeys: remediation.strippedKeys };
        }

        // Analyze the new failure
        const newDiagnosis = TestFailureAnalyzer.analyze(result.stdout, result.stderr, result.exitCode);
        if (newDiagnosis.category !== diagnosis.category) {
          console.log(chalk.yellow(`  ⚠ Different failure after remediation: [${newDiagnosis.category}] ${newDiagnosis.summary}`));
          // Update diagnosis for next iteration
          Object.assign(diagnosis, newDiagnosis);
        } else {
          break; // Same error, remediation didn't help
        }
      } else if (remediation.action === 'installed_dependency') {
        console.log(chalk.blue(`  🔄 Re-running tests after installing dependency...`));
        result = this._executeTestsCapture(testCommand);

        if (result.passed) {
          console.log(chalk.green('  ✓ Tests passed after installing dependency'));
          return { passed: true, remediated: true, action: remediation.action };
        }

        // Analyze the new failure
        const newDiagnosis = TestFailureAnalyzer.analyze(result.stdout, result.stderr, result.exitCode);
        Object.assign(diagnosis, newDiagnosis);
      } else if (remediation.action === 'retry') {
        // Simple retry for transient issues
        console.log(chalk.blue(`  🔄 Retrying tests (transient failure)...`));
        await new Promise(r => setTimeout(r, 2000 * attempts)); // backoff
        result = this._executeTestsCapture(testCommand);

        if (result.passed) {
          console.log(chalk.green('  ✓ Tests passed on retry'));
          return { passed: true, remediated: true, action: 'retry' };
        }
        break; // Don't keep retrying transient forever
      } else {
        break;
      }
    }

    // ── All remediation failed — build detailed error ──────────────────────
    const isAgentFault = diagnosis.category === FAILURE_CATEGORY.TEST_FAILURE ||
                         diagnosis.category === FAILURE_CATEGORY.SYNTAX_ERROR;

    const errMsg = this._buildDetailedErrorMessage(diagnosis, result, isAgentFault);
    console.error(chalk.red(`✗ ${errMsg}`));

    if (this.config.safety?.rollback_on_failure !== false && isAgentFault) {
      const err = new Error(errMsg);
      err.diagnosis = diagnosis;
      err.isAgentFault = true;
      throw err;
    }

    if (this.config.safety?.rollback_on_failure !== false && !isAgentFault) {
      // Environment/infra issue — don't rollback agent changes, but warn loudly
      console.warn(chalk.yellow(`\n  ⚠ Tests failed due to ${diagnosis.category} — NOT rolling back agent changes`));
      console.warn(chalk.yellow(`  ⚠ The agent's code changes are preserved. Fix the environment issue and re-run tests manually.`));
      return {
        passed: false,
        preExisting: false,
        diagnosis,
        isAgentFault: false,
        reason: errMsg,
      };
    }

    console.warn(chalk.yellow('⚠ Tests failed but rollback_on_failure is disabled'));
    return { passed: false, diagnosis, reason: errMsg };
  }

  /**
   * Build a detailed, human-readable error message from the diagnosis.
   */
  _buildDetailedErrorMessage(diagnosis, result, isAgentFault) {
    const parts = [`Tests failed [${diagnosis.category}]: ${diagnosis.summary}`];

    if (diagnosis.details?.extraFields?.length) {
      parts.push(`  Extra env vars: ${diagnosis.details.extraFields.join(', ')}`);
    }
    if (diagnosis.details?.missingFields?.length) {
      parts.push(`  Missing fields: ${diagnosis.details.missingFields.join(', ')}`);
    }
    if (diagnosis.details?.importChain?.length) {
      parts.push('  Import chain:');
      for (const step of diagnosis.details.importChain.slice(0, 5)) {
        parts.push(`    ${step.file}:${step.line} in ${step.scope} → ${step.code}`);
      }
    }
    if (isAgentFault) {
      parts.push('  → Agent changes likely caused this failure — rolling back');
    } else {
      parts.push('  → This is an environment/infrastructure issue, not caused by agent changes');
    }

    // Add last few lines of output as context
    const tailLines = (result.output || '').split('\n').filter(l => l.trim()).slice(-8);
    if (tailLines.length > 0) {
      parts.push('  Last output lines:');
      for (const line of tailLines) {
        parts.push(`    ${line}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Resolve the test command from config or auto-detection.
   * @returns {string|null}
   */
  _resolveTestCommand() {
    let testCommand = this.config.project_context?.test_command;

    if (!testCommand || testCommand === 'npm test') {
      const detected = this.detectProjectType();
      if (!detected.testCommand) {
        console.log(`ℹ No test suite detected for ${detected.type} project. Skipping tests.`);
        return null;
      }
      testCommand = detected.testCommand;
    }
    return testCommand;
  }

  /**
   * Execute tests and capture stdout/stderr while also streaming to console.
   * Uses spawnSync with pipe to capture output programmatically.
   * @param {string} testCommand - The test command to run
   * @param {object} opts - Optional overrides (e.g. { env })
   * @returns {{ passed: boolean, stdout: string, stderr: string, output: string, exitCode: number }}
   */
  _executeTestsCapture(testCommand, opts = {}) {
    const env = opts.env || { ...process.env, PYTHONPATH: process.cwd() };

    try {
      const result = spawnSync('sh', ['-c', testCommand], {
        env,
        cwd: process.cwd(),
        stdio: ['inherit', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024, // 10 MB
        timeout: this.config.safety?.test_timeout || 300000, // 5 min default
      });

      const stdout = result.stdout ? result.stdout.toString() : '';
      const stderr = result.stderr ? result.stderr.toString() : '';
      const output = `${stdout}\n${stderr}`;

      // Stream captured output to console so the user still sees it
      if (stdout.trim()) process.stdout.write(stdout);
      if (stderr.trim()) process.stderr.write(stderr);

      const passed = result.status === 0;
      return { passed, stdout, stderr, output, exitCode: result.status ?? -1 };
    } catch (error) {
      // spawnSync itself errored (e.g. command not found, signal kill)
      const stderr = error.stderr ? error.stderr.toString() : error.message;
      return { passed: false, stdout: '', stderr, output: stderr, exitCode: error.status ?? -1 };
    }
  }
}

// Export everything for testing and external use
module.exports = SafetyManager;
module.exports.SafetyManager = SafetyManager;
module.exports.TestFailureAnalyzer = TestFailureAnalyzer;
module.exports.TestRemediator = TestRemediator;
module.exports.FAILURE_CATEGORY = FAILURE_CATEGORY;
