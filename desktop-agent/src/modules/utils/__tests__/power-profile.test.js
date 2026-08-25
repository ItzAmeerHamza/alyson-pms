const {
  getUrlPollDelayMs,
  getAppDetectIntervalMs,
  getSessionCheckpointMs,
} = require('../power-profile');

describe('power-profile — energy-safe poll cadence', () => {
  const prevTracking = global.isTracking;
  const prevTm = global.trackingManager;
  const prevLocked = global.isScreenLocked;
  const prevIdle = global.enhancedIdleMonitor;

  afterEach(() => {
    global.isTracking = prevTracking;
    global.trackingManager = prevTm;
    global.isScreenLocked = prevLocked;
    global.enhancedIdleMonitor = prevIdle;
  });

  it('URL poll is 30s while tracking and 60s when stopped', () => {
    global.isTracking = true;
    global.trackingManager = { currentTimeLogId: 'log-1' };
    global.isScreenLocked = false;
    global.enhancedIdleMonitor = { isIdle: false };
    expect(getUrlPollDelayMs()).toBe(30000);

    global.isTracking = false;
    expect(getUrlPollDelayMs()).toBe(60000);
  });

  it('app detect is 45s while active', () => {
    global.isScreenLocked = false;
    global.enhancedIdleMonitor = { isIdle: false };
    expect(getAppDetectIntervalMs()).toBe(45000);
  });

  it('session checkpoint is 30s', () => {
    expect(getSessionCheckpointMs()).toBe(30000);
  });
});
