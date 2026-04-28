#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

try {
  const reportPath = path.join(__dirname, 'cross-platform-report.json');
  if (!fs.existsSync(reportPath)) {
    console.log('⚠️ No cross-platform report found, nothing to do.');
    process.exit(0);
  }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  console.log('Cross-Platform Totals:', report.totals);
  process.exit(0);
} catch (e) {
  console.log('⚠️ Unable to read report:', e.message);
  process.exit(0);
}


