const simpleGit = require('simple-git');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');

class GitManager {
  constructor() {
    this.git = simpleGit();
    this.operationLog = [];
  }

  /**
   * Validate that we're in a git repository
   */
  async validateRepository() {
    try {
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        throw new Error('Not a git repository. Run \'git init\' first.');
      }
      return true;
    } catch (error) {
      throw new Error(`Git repository validation failed: ${error.message}`);
    }
  }

  /**
   * Check if repository has uncommitted changes
   */
  async hasUncommittedChanges() {
    try {
      const status = await this.git.status();
      return status.modified.length > 0 ||
        status.created.length > 0 ||
        status.deleted.length > 0 ||
        status.renamed.length > 0;
    } catch (error) {
      throw new Error(`Failed to check git status: ${error.message}`);
    }
  }

  /**
   * Check if repository has any commits
   */
  async hasCommits() {
    try {
      const log = await this.git.log();
      return log.total > 0;
    } catch (error) {
      // If this fails, likely no commits exist
      return false;
    }
  }

  /**
   * Create a snapshot branch for the session
   */
  async createSnapshot(sessionId) {
    try {
      await this.validateRepository();

      const hasCommits = await this.hasCommits();
      if (!hasCommits) {
        console.log(chalk.yellow('⚠ No commits found. Creating initial commit...'));
        await this.git.add('.');
        await this.git.commit('Initial commit for CodeSwarm');
      }

      const currentBranch = await this.getCurrentBranch();
      const snapshotBranch = `mehaisi-session-${sessionId}`;

      // Check if branch already exists
      const branches = await this.git.branchLocal();
      if (branches.all.includes(snapshotBranch)) {
        console.log(chalk.yellow(`⚠ Branch ${snapshotBranch} already exists, using it...`));
      } else {
        await this.git.checkoutLocalBranch(snapshotBranch);
      }

      const commit = await this.getCurrentCommit();

      this.logOperation('createSnapshot', { sessionId, branch: snapshotBranch, commit });

      return {
        branch: snapshotBranch,
        commit,
        originalBranch: currentBranch
      };
    } catch (error) {
      throw new Error(`Failed to create snapshot: ${error.message}`);
    }
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch() {
    try {
      const status = await this.git.status();
      return status.current;
    } catch (error) {
      throw new Error(`Failed to get current branch: ${error.message}`);
    }
  }

  /**
   * Get current commit hash
   */
  async getCurrentCommit() {
    try {
      await this.validateRepository();
      const log = await this.git.log(['-1']);
      if (!log.latest) {
        throw new Error('No commits found in repository');
      }
      return log.latest.hash;
    } catch (error) {
      throw new Error(`Failed to get current commit: ${error.message}`);
    }
  }

  /**
   * Verify that a commit exists
   */
  async commitExists(commitHash) {
    try {
      await this.git.catFile(['-t', commitHash]);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create a git tag
   */
  async createTag(tagName) {
    try {
      await this.validateRepository();

      // Check if tag already exists
      const tags = await this.git.tags();
      if (tags.all.includes(tagName)) {
        console.log(chalk.yellow(`⚠ Tag ${tagName} already exists`));
        return;
      }

      await this.git.addTag(tagName);
      this.logOperation('createTag', { tagName });

      console.log(chalk.green(`✓ Created tag: ${tagName}`));
    } catch (error) {
      throw new Error(`Failed to create tag: ${error.message}`);
    }
  }

  /**
   * Rollback to a specific commit with safety checks
   */
  async rollbackToCommit(commitHash) {
    try {
      await this.validateRepository();

      // Verify commit exists
      const exists = await this.commitExists(commitHash);
      if (!exists) {
        throw new Error(`Commit ${commitHash} does not exist`);
      }

      // Warn if there are uncommitted changes
      if (await this.hasUncommittedChanges()) {
        console.log(chalk.yellow('⚠ Warning: Uncommitted changes will be lost'));
      }

      // Perform rollback
      await this.git.reset(['--hard', commitHash]);
      this.logOperation('rollback', { commitHash });

      console.log(chalk.green(`✓ Rolled back to commit: ${commitHash.substring(0, 7)}`));
    } catch (error) {
      throw new Error(`Failed to rollback: ${error.message} `);
    }
  }

  /**
   * Get list of modified files
   */
  async getModifiedFiles() {
    try {
      await this.validateRepository();
      const status = await this.git.status();
      return {
        modified: status.modified,
        created: status.created,
        deleted: status.deleted,
        renamed: status.renamed,
        all: [].concat(status.modified, status.created, status.deleted, status.renamed)
      };
    } catch (error) {
      throw new Error(`Failed to get modified files: ${error.message} `);
    }
  }

  /**
   * Get diff between commits
   */
  async getDiff(fromCommit, toCommit = 'HEAD') {
    try {
      await this.validateRepository();
      const diff = await this.git.diff([fromCommit, toCommit]);
      return diff;
    } catch (error) {
      throw new Error(`Failed to get diff: ${error.message} `);
    }
  }

  /**
   * Commit changes with a message
   */
  async commit(message) {
    try {
      await this.validateRepository();

      if (!await this.hasUncommittedChanges()) {
        console.log(chalk.yellow('⚠ No changes to commit'));
        return null;
      }

      await this.git.add('.');
      const result = await this.git.commit(message);
      this.logOperation('commit', { message, hash: result.commit });

      return result.commit;
    } catch (error) {
      throw new Error(`Failed to commit: ${error.message} `);
    }
  }

  /**
   * Check if repository is in a clean state
   */
  async isClean() {
    try {
      const status = await this.git.status();
      return status.isClean();
    } catch (error) {
      throw new Error(`Failed to check repository cleanliness: ${error.message} `);
    }
  }

  /**
   * Handle detached HEAD state
   */
  async handleDetachedHead() {
    try {
      const status = await this.git.status();
      if (status.detached) {
        console.log(chalk.yellow('⚠ Repository is in detached HEAD state'));
        console.log(chalk.yellow('Creating recovery branch...'));

        const recoveryBranch = `mehaisi-recovery - ${Date.now()}`;
        await this.git.checkoutLocalBranch(recoveryBranch);

        console.log(chalk.green(`✓ Created recovery branch: ${recoveryBranch}`));
        return recoveryBranch;
      }
      return null;
    } catch (error) {
      throw new Error(`Failed to handle detached HEAD: ${error.message} `);
    }
  }

  /**
   * Log git operations for audit trail
   */
  logOperation(operation, details) {
    const entry = {
      timestamp: new Date().toISOString(),
      operation,
      details
    };
    this.operationLog.push(entry);
  }

  /**
   * Get operation log
   */
  getOperationLog() {
    return this.operationLog;
  }

  /**
   * Save operation log to file
   */
  async saveOperationLog(sessionDir) {
    try {
      const logPath = path.join(sessionDir, 'git-operations.json');
      await fs.writeJSON(logPath, this.operationLog, { spaces: 2 });
    } catch (error) {
      console.error(chalk.red(`Failed to save operation log: ${error.message} `));
    }
  }
}

module.exports = GitManager;
