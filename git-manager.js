const simpleGit = require('simple-git');
const git = simpleGit();

class GitManager {
  async createSnapshot(sessionId) {
    const branch = `codeswarm-session-${sessionId}`;
    await git.checkoutLocalBranch(branch);
    return { branch, commit: await this.getCurrentCommit() };
  }

  async getCurrentCommit() {
    const log = await git.log(['-1']);
    return log.latest.hash;
  }

  async createTag(tagName) {
    await git.addTag(tagName);
  }

  async rollbackToCommit(commit) {
    await git.reset(['--hard', commit]);
  }

  async getModifiedFiles() {
    const status = await git.status();
    return status.modified.concat(status.created);
  }
}

module.exports = GitManager;
