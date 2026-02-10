const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

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
    if (_isNoopScript(testCommand)) {
      console.log(`ℹ Test command is placeholder: "${testCommand}". Skipping.`);
      return true;
    }

    try {
      console.log(`🧪 Running tests: ${testCommand}`);
      execSync(testCommand, {
        stdio: 'inherit',
        env: { ...process.env, PYTHONPATH: process.cwd() }
      });
      console.log('✓ Tests passed');
      return true;
    } catch (error) {
      // Extract useful info from the error
      const stderr = error.stderr ? error.stderr.toString().trim() : '';
      const lastLines = stderr ? `\n  ${stderr.split('\n').slice(-5).join('\n  ')}` : '';
      const msg = `Tests failed (exit code ${error.status || '?'})${lastLines}`;
      console.error(`✗ ${msg}`);

      if (this.config.safety?.rollback_on_failure !== false) {
        throw new Error(msg);
      }
      console.warn('⚠ Tests failed but rollback_on_failure is disabled');
      return false;
    }
  }
}

module.exports = SafetyManager;
