const { execSync } = require('child_process');
const chalk = require('chalk');

async function showDiff(session, options) {
  console.log(chalk.blue('\n📝 Changes:\n'));
  
  try {
    const diff = execSync('git diff', { encoding: 'utf8' });
    console.log(diff);
  } catch (error) {
    console.log(chalk.yellow('No changes to display'));
  }
}

module.exports = { showDiff };
