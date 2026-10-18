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
    try {
      require('../../../lib/meeting-context')._resetMeetingSessionForTests();
    } catch (_) { /* ignore */ }
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

  it.each(['Google Meet', 'Zoom', 'Microsoft Teams', 'Webex', 'Skype'])(
    'stops and closes the session even when leftover %s is still open',
    (label) => {
      const { _setPresenceForTests, isInMeetingSession } = require('../../../lib/meeting-context');
      _setPresenceForTests({ active: true, label });
      expect(isInMeetingSession()).toBe(true);

      mgr._lidHaltInProgress = false;
      mgr.global.isTracking = true;
      mgr.global.currentTimeLogId = 'meet-row';
      mgr.handleLidCloseOrSleep('suspend');

      expect(stopTracking).toHaveBeenCalledWith('system_sleep');
      expect(halt).toHaveBeenCalled();
      expect(isInMeetingSession()).toBe(false);
    },
  );
});

describe('short suspend (Windows suspend/resume blip) restarts tracking', () => {
  let handlers;
  let startTracking;
  let trayManager;
  let mgr;
  let nowMs;
  let nowSpy;
  let g;

  const flush = () => new Promise((resolve) => setTimeout(resolve, 150));

  const suspend = () => handlers.suspend();
  const resume = async () => {
    await handlers.resume();
    await flush();
  };

  beforeEach(() => {
    handlers = {};
    nowMs = Date.parse('2026-10-15T07:49:21.724Z');
    nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
    startTracking = jest.fn(async () => ({ success: true }));
    trayManager = {
      onSystemSleep: jest.fn(),
      onSystemResume: jest.fn(),
      showAutoStopNotification: jest.fn(),
      _pendingAutoStopReason: 'system_sleep',
      _pendingAutoStopMessage: null,
    };
    g = {
      isTracking: true,
      currentTimeLogId: 'open-row',
      currentProjectId: 'proj-1',
      trackingManager: {
        isTracking: true,
        currentTimeLogId: 'open-row',
        haltBackgroundProcesses: jest.fn(),
        armDurableSleepStop: jest.fn(),
        _readSessionCheckpoint: () => ({ checkpointAt: '2026-10-15T07:49:16.000Z' }),
      },
      trayManager,
      loadDesktopAgentSession: jest.fn(async () => ({ id: 'u1', email: 'garima@example.com' })),
      showTrayNotification: jest.fn(),
      // The real stop flips tracking off; resume then sees it stopped.
      stopTracking: jest.fn(() => {
        g.isTracking = false;
        g.currentTimeLogId = null;
        g.trackingManager.isTracking = false;
        g.trackingManager.currentTimeLogId = null;
      }),
      startTracking,
    };
    mgr = new EventHandlerManager({
      global: g,
      console: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
      powerMonitor: { on: (event, fn) => { handlers[event] = fn; } },
    });
    mgr.setupPowerMonitoring();
  });

  afterEach(() => {
    nowSpy.mockRestore();
    global._lidDownArmed = false;
    global._lidLastProofIso = null;
    global._resumeTrackingAfterWake = null;
  });

  it('restarts on the same project when resume follows within a second', async () => {
    suspend();
    nowMs += 200;
    await resume();

    expect(g.stopTracking).toHaveBeenCalledWith('system_sleep');
    expect(startTracking).toHaveBeenCalledTimes(1);
    expect(startTracking).toHaveBeenCalledWith('proj-1');
    expect(trayManager._pendingAutoStopReason).toBeNull();
    expect(trayManager.showAutoStopNotification).not.toHaveBeenCalled();
    expect(g.showTrayNotification).not.toHaveBeenCalled();
  });

  it('still restarts at 46s, the longest blip seen in the logs', async () => {
    suspend();
    nowMs += 46_000;
    await resume();
    expect(startTracking).toHaveBeenCalledTimes(1);
  });

  it('stays stopped after a real sleep and keeps the sleep notification', async () => {
    suspend();
    nowMs += 30 * 60 * 1000;
    await resume();

    expect(startTracking).not.toHaveBeenCalled();
    expect(trayManager._pendingAutoStopReason).toBe('system_sleep');
  });

  it('does not restart when nothing was tracking at suspend', async () => {
    g.isTracking = false;
    g.currentTimeLogId = null;
    g.trackingManager.isTracking = false;
    g.trackingManager.currentTimeLogId = null;
    suspend();
    nowMs += 200;
    await resume();

    expect(startTracking).not.toHaveBeenCalled();
  });

  it('does not reuse one suspend for a second resume', async () => {
    suspend();
    nowMs += 200;
    await resume();
    startTracking.mockClear();
    g.isTracking = false;
    g.trackingManager.isTracking = false;

    nowMs += 5000;
    await resume();
    expect(startTracking).not.toHaveBeenCalled();
  });

  it('does not restart when the employee has no saved login', async () => {
    g.loadDesktopAgentSession = jest.fn(async () => null);
    suspend();
    nowMs += 200;
    await resume();

    expect(startTracking).not.toHaveBeenCalled();
    expect(trayManager.showAutoStopNotification).toHaveBeenCalledWith('system_sleep');
  });

  it('shows the sleep notification if the restart itself fails', async () => {
    startTracking.mockRejectedValueOnce(new Error('boom'));
    suspend();
    nowMs += 200;
    await resume();

    expect(trayManager.showAutoStopNotification).toHaveBeenCalledWith('system_sleep');
  });

  it('does not restart when the employee already started tracking again', async () => {
    suspend();
    nowMs += 200;
    g.stopTracking.mockImplementation(() => {});
    g.isTracking = true;
    await resume();

    expect(startTracking).not.toHaveBeenCalled();
  });

  it('caps restarts so a machine looping suspend/resume cannot thrash', async () => {
    for (let i = 0; i < 5; i += 1) {
      g.isTracking = true;
      g.currentTimeLogId = `row-${i}`;
      g.trackingManager.isTracking = true;
      suspend();
      nowMs += 300;
      await resume();
      nowMs += 1000;
    }
    expect(startTracking).toHaveBeenCalledTimes(5);

    g.isTracking = true;
    g.currentTimeLogId = 'row-6';
    g.trackingManager.isTracking = true;
    trayManager._pendingAutoStopReason = 'system_sleep';
    suspend();
    nowMs += 300;
    await resume();

    expect(startTracking).toHaveBeenCalledTimes(5);
    // Left for the tray's own onSystemResume to fire.
    expect(trayManager._pendingAutoStopReason).toBe('system_sleep');
  });
});
