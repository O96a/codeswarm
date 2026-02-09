const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

async function showReport(session, options) {
  const sessionsDir = path.join(process.cwd(), '.codeswarm', 'sessions');
  
  if (options.last) {
    const sessions = await fs.readdir(sessionsDir);
    session = sessions[sessions.length - 1];
  }

  const reportPath = path.join(sessionsDir, session, 'session-report.json');
  
  if (!await fs.pathExists(reportPath)) {
    console.log(chalk.red('\n✗ Report not found\n'));
    return;
  }

  const report = await fs.readJSON(reportPath);
  
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(chalk.blue.bold('\n📊 Session Report:\n'));
    console.log(chalk.white(`Session: ${report.sessionId}`));
    console.log(chalk.white(`Duration: ${report.stats?.totalDuration}ms`));
    console.log(chalk.white(`Agents: ${report.stats?.totalAgents}`));
    console.log(chalk.white(`Files Modified: ${report.stats?.filesModified}\n`));
  }
}

module.exports = { showReport };
