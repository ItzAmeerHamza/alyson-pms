'use strict';

/**
 * Stable folder for payroll-durable files (checkpoint, offline queue, pending closes).
 *
 * Do not use Electron userData — the product folder name changes
 * (alyson-pm-desktop-agent vs Alyson Work Time). Session recovery used
 * app.getPath('userData') and missed checkpoints written here, then the
 * 5-minute health check treated that as stale and Stopped a live timer.
 */
function getPayrollAppDataDir() {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const userDataDir =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config'));
  const dir = path.join(userDataDir, 'Alyson Work Time');
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (_) {
    /* tests / read-only */
  }
  return dir;
}

module.exports = { getPayrollAppDataDir };
