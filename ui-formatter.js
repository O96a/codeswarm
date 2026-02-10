/**
 * UI Formatter
 * 
 * Provides consistent, modern, point-based formatting for CLI output
 */

const chalk = require('chalk');
const boxen = require('boxen');

class UIFormatter {
  constructor() {
    this.icons = {
      success: '✓',
      error: '✗',
      warning: '⚠',
      info: 'ℹ',
      run: '▶',
      done: '●',
      arrow: '→',
      bullet: '•',
      check: '✔',
      cross: '✖',
      star: '★',
      rocket: '🚀',
      gear: '⚙',
      lock: '🔐',
      key: '🔑',
      doc: '📄',
      folder: '📁',
      search: '🔍',
      fire: '🔥',
      zap: '⚡',
      target: '🎯'
    };
  }

  /**
   * Main header for commands
   */
  header(text, icon = 'rocket') {
    console.log('\n' + chalk.bold.cyan(`${this.icons[icon]} ${text.toUpperCase()}`));
    console.log(chalk.gray('─'.repeat(60)));
  }

  /**
   * Section header
   */
  section(text) {
    console.log(chalk.bold.blue(`\n${text}`));
  }

  /**
   * Success message
   */
  success(text, compact = false) {
    const prefix = chalk.green(this.icons.success);
    console.log(compact ? `${prefix} ${text}` : `\n${prefix} ${chalk.green(text)}`);
  }

  /**
   * Error message
   */
  error(text, compact = false) {
    const prefix = chalk.red(this.icons.error);
    console.log(compact ? `${prefix} ${text}` : `\n${prefix} ${chalk.red(text)}`);
  }

  /**
   * Warning message
   */
  warning(text, compact = false) {
    const prefix = chalk.yellow(this.icons.warning);
    console.log(compact ? `${prefix} ${text}` : `\n${prefix} ${chalk.yellow(text)}`);
  }

  /**
   * Info message
   */
  info(text, compact = false) {
    const prefix = chalk.blue(this.icons.info);
    console.log(compact ? `${prefix} ${text}` : `\n${prefix} ${chalk.blue(text)}`);
  }

  /**
   * List item (bullet point)
   */
  item(text, indent = 0) {
    const spacing = '  '.repeat(indent);
    console.log(`${spacing}${chalk.gray(this.icons.bullet)} ${text}`);
  }

  /**
   * Numbered list item
   */
  numberedItem(number, text, indent = 0) {
    const spacing = '  '.repeat(indent);
    console.log(`${spacing}${chalk.cyan(`${number}.`)} ${text}`);
  }

  /**
   * Key-value pair
   */
  keyValue(key, value, indent = 0) {
    const spacing = '  '.repeat(indent);
    console.log(`${spacing}${chalk.gray(key + ':')} ${chalk.white(value)}`);
  }

  /**
   * Step indicator
   */
  step(current, total, text) {
    const progress = `[${current}/${total}]`;
    console.log(`\n${chalk.cyan(progress)} ${chalk.bold(text)}`);
  }

  /**
   * Phase banner
   */
  phase(text) {
    console.log('\n' + chalk.bgBlue.white.bold(` ${text} `));
  }

  /**
   * Agent execution header
   */
  agentStart(name) {
    console.log(`\n${chalk.cyan(this.icons.run)} ${chalk.bold(name)}`);
  }

  /**
   * Agent completion
   */
  agentComplete(name, duration) {
    const time = duration ? chalk.gray(` (${duration}ms)`) : '';
    console.log(`${chalk.green(this.icons.check)} ${name}${time}`);
  }

  /**
   * Progress indicator
   */
  progress(message) {
    console.log(`  ${chalk.gray(this.icons.bullet)} ${chalk.dim(message)}`);
  }

  /**
   * Box for important messages
   */
  box(title, items, type = 'info') {
    const colors = {
      info: 'cyan',
      success: 'green',
      warning: 'yellow',
      error: 'red'
    };
    
    let content = chalk.bold(title) + '\n';
    items.forEach(item => {
      content += `${this.icons.bullet} ${item}\n`;
    });

    console.log('\n' + boxen(content.trim(), {
      padding: { top: 0, right: 1, bottom: 0, left: 1 },
      margin: 0,
      borderStyle: 'round',
      borderColor: colors[type] || 'cyan'
    }));
  }

  /**
   * Table-like output
   */
  table(headers, rows) {
    const colWidths = headers.map((h, i) => 
      Math.max(h.length, ...rows.map(r => String(r[i] || '').length))
    );

    // Header
    console.log('\n' + chalk.bold(
      headers.map((h, i) => h.padEnd(colWidths[i])).join('  ')
    ));
    console.log(chalk.gray('─'.repeat(colWidths.reduce((a, b) => a + b + 2, 0))));

    // Rows
    rows.forEach(row => {
      console.log(row.map((cell, i) => 
        String(cell || '').padEnd(colWidths[i])
      ).join('  '));
    });
  }

  /**
   * Divider
   */
  divider() {
    console.log(chalk.gray('─'.repeat(60)));
  }

  /**
   * Spacer
   */
  spacer() {
    console.log('');
  }

  /**
   * Summary box
   */
  summary(stats) {
    const items = Object.entries(stats).map(([key, value]) => 
      `${chalk.bold(key)}: ${chalk.cyan(value)}`
    );
    
    console.log('\n' + boxen(items.join('\n'), {
      padding: { top: 0, right: 1, bottom: 0, left: 1 },
      margin: 0,
      borderStyle: 'round',
      borderColor: 'cyan',
      title: 'Summary',
      titleAlignment: 'center'
    }));
  }

  /**
   * Next steps guide
   */
  nextSteps(title, steps) {
    this.section(`${this.icons.target} ${title}`);
    steps.forEach((step, i) => {
      this.numberedItem(i + 1, step);
    });
    this.spacer();
  }

  /**
   * Inline status
   */
  status(label, value, type = 'info') {
    const colors = {
      success: chalk.green,
      error: chalk.red,
      warning: chalk.yellow,
      info: chalk.cyan
    };
    const color = colors[type] || chalk.white;
    console.log(`${chalk.gray(label)} ${color(value)}`);
  }

  /**
   * Compact list
   */
  compactList(items, color = 'white') {
    const colorFn = chalk[color] || chalk.white;
    items.forEach(item => {
      console.log(`  ${chalk.gray(this.icons.bullet)} ${colorFn(item)}`);
    });
  }

  /**
   * Clear previous line (for dynamic updates)
   */
  clearLine() {
    process.stdout.write('\r\x1b[K');
  }

  /**
   * Inline spinner-like update
   */
  updateLine(text) {
    this.clearLine();
    process.stdout.write(text);
  }
}

module.exports = new UIFormatter();
