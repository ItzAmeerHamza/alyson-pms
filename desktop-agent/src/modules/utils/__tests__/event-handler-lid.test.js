const EventHandlerManager = require('../event-handler-manager');

jest.mock('../session-recovery', () => ({
  closeOpenSessionsAfterExplicitStop: jest.fn(async () => ({ closed: 0 })),
  reconcileAfterWake: jest.fn(async () => ({ ok: true })),
}));

describe('lid close / display-sleep halt', () => {
  let halt;
  let stopTracking;
  let stopMonitoring;
  let mgr;

  beforeEach(() => {
    halt = jest.fn();
    stopTracking = jest.fn();
    stopMonitoring = jest.fn();
    global._resumeTrackingAfterWake = { projectId: 1 };
    global._lidDownArmed = false;
    global._lidLastProofIso = null;

    mgr = new EventHandlerManager({
      global: {
        isTracking: false,
        currentTimeLogId: null,
        trackingManager: {
          isTracking: false,
          currentTimeLogId: null,
          haltBackgroundProcesses: halt,
          armDurableSleepStop: jest.fn(),
          _readSessionCheckpoint: () => ({ checkpointAt: '2026-08-25T10:00:00.000Z' }),
        },
        trayManager: { onSystemSleep: jest.fn() },
        stopTracking,
      },
      console: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
      antiCheatDetector: { stopMonitoring },
    });
  });

  afterEach(() => {
    global._resumeTrackingAfterWake = null;
    global._lidDownArmed = false;
    global._lidLastProofIso = null;
  });

  it('stops leftover processes even when tracking is already Stopped', () => {
    mgr.handleLidCloseOrSleep('display-sleep');

    expect(halt).toHaveBeenCalledTimes(1);
    expect(stopTracking).not.toHaveBeenCalled();
    expect(stopMonitoring).toHaveBeenCalledTimes(1);
    expect(global._resumeTrackingAfterWake).toBeNull();
    expect(global._lidDownArmed).toBe(true);
  });

  it('closes an open session and does not arm wake auto-resume', () => {
    mgr.global.isTracking = true;
    mgr.global.currentTimeLogId = 'open-row';
    mgr.handleLidCloseOrSleep('suspend');

    expect(mgr.global.trackingManager.armDurableSleepStop).toHaveBeenCalledWith('system_sleep');
    expect(stopTracking).toHaveBeenCalledWith('system_sleep');
    expect(halt).toHaveBeenCalled();
    expect(global._resumeTrackingAfterWake).toBeNull();
  });

  it('does not run a second halt when suspend follows display-sleep', () => {
    mgr.handleLidCloseOrSleep('display-sleep');
    mgr.handleLidCloseOrSleep('suspend');
    expect(halt).toHaveBeenCalledTimes(1);
  });
});
