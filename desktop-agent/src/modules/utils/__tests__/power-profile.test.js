const {
  getUrlPollDelayMs,
  getAppDetectIntervalMs,
  getSessionCheckpointMs,
  getAppDetectCacheMs,
  getUrlPollStaggerMs,
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

  it('URL poll is 2m while tracking and 2m when stopped (defaults)', () => {
    global.isTracking = true;
    global.trackingManager = { currentTimeLogId: 'log-1' };
    global.isScreenLocked = false;
    global.enhancedIdleMonitor = { isIdle: false };
    expect(getUrlPollDelayMs()).toBe(120000);

    global.isTracking = false;
    expect(getUrlPollDelayMs()).toBe(120000);
  });

  it('app detect is 2m while active', () => {
    global.isScreenLocked = false;
    global.enhancedIdleMonitor = { isIdle: false };
    expect(getAppDetectIntervalMs()).toBe(120000);
  });

  it('session checkpoint is 60s (crash floor only — does not add tracked seconds)', () => {
    expect(getSessionCheckpointMs()).toBe(60000);
  });

  it('app detect cache and URL stagger defaults', () => {
    expect(getAppDetectCacheMs()).toBe(60000);
    expect(getUrlPollStaggerMs()).toBe(60000);
  });

  it('live activity IPC is 90s and system health is 3m', () => {
    const { IPC } = require('../power-profile');
    expect(IPC.liveActivityMs).toBe(90000);
    expect(IPC.systemHealthMs).toBe(180000);
  });
});
