const fs = require('fs');
const path = require('path');
const os = require('os');

const { getPayrollAppDataDir } = require('../payroll-app-data-dir');
const { runSessionHealthCheckTick } = require('../session-recovery');

describe('live session health check', () => {
  const previous = {};

  beforeEach(() => {
    previous.currentUserId = global.currentUserId;
    previous.isTracking = global.isTracking;
    previous.currentTimeLogId = global.currentTimeLogId;
    previous.sessionStartTime = global.sessionStartTime;
    previous.trackingManager = global.trackingManager;
    previous.startTracking = global.startTracking;
  });

  afterEach(() => {
    global.currentUserId = previous.currentUserId;
    global.isTracking = previous.isTracking;
    global.currentTimeLogId = previous.currentTimeLogId;
    global.sessionStartTime = previous.sessionStartTime;
    global.trackingManager = previous.trackingManager;
    global.startTracking = previous.startTracking;
  });

  it('writes checkpoints to the same payroll folder recovery reads', () => {
    const dir = getPayrollAppDataDir();
    expect(path.basename(dir)).toBe('Alyson Work Time');
    expect(dir).not.toContain('alyson-pm-desktop-agent');
    if (process.platform === 'darwin') {
      expect(dir).toBe(
        path.join(os.homedir(), 'Library', 'Application Support', 'Alyson Work Time'),
      );
    }
  });

  it('does not Stop a live session when the checkpoint file is missing', async () => {
    const checkpoints = [];
    const origExists = fs.existsSync.bind(fs);
    const existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (String(p).includes('session-checkpoint.json')) return false;
      return origExists(p);
    });

    global.currentUserId = '1195';
    global.isTracking = true;
    global.currentTimeLogId = '4f50a7e3-57f5-4709-92ab-b494b7767b82';
    global.sessionStartTime = new Date().toISOString();
    global.trackingManager = {
      isTracking: true,
      currentTimeLogId: '4f50a7e3-57f5-4709-92ab-b494b7767b82',
      sessionStartTime: global.sessionStartTime,
      _readSessionCheckpoint: () => null,
      _checkpointCurrentTimeLog: async () => {
        checkpoints.push('healed');
      },
      _stopTimeLogCheckpoint: () => {
        throw new Error('must not stop checkpoint on a live heal');
      },
    };

    try {
      await runSessionHealthCheckTick();
    } finally {
      existsSpy.mockRestore();
    }

    expect(checkpoints).toEqual(['healed']);
    expect(global.isTracking).toBe(true);
    expect(global.currentTimeLogId).toBe('4f50a7e3-57f5-4709-92ab-b494b7767b82');
  });
});
