const fs = require('fs-extra');
const path = require('path');

class ReportGenerator {
  constructor(sessionDir) {
    this.sessionDir = sessionDir;
  }

  async generateAgentReport(agentName, result) {
    const reportPath = path.join(this.sessionDir, 'reports', `${agentName}.json`);
    await fs.writeJSON(reportPath, result, { spaces: 2 });
  }

  async generatePhaseReport(phaseName, results) {
    const reportPath = path.join(this.sessionDir, 'reports', `phase-${phaseName}.json`);
    await fs.writeJSON(reportPath, results, { spaces: 2 });
  }

  async generateHTML(report) {
    const html = `
<!DOCTYPE html>
<html>
<head><title>CodeSwarm Report</title></head>
<body>
  <h1>CodeSwarm Session Report</h1>
  <pre>${JSON.stringify(report, null, 2)}</pre>
</body>
</html>`;
    await fs.writeFile(path.join(this.sessionDir, 'report.html'), html);
  }
}

module.exports = ReportGenerator;
