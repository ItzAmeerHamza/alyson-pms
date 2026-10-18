/**
 * End-to-end: a working day through the real desktop code, then the
 * non-effective figure the desktop card shows for it.
 *
 * Real: idle monitor on its own 60s check, still-working alert and countdown,
 * GracefulShutdownManager Stop (the Stop button's path), meeting detection,
 * screenshot meeting floor and title tag, idle-log write, today's non-effective
 * calculation under Pulse rules, and the card value.
 *
 * Simulated: the clock, keyboard/mouse (OS idle seconds), the browser-tab
 * meeting probe, the alert window, and the backend — an in-memory table with
 * the same only-grows upsert as UPSERT_IDLE_LOG_SQL. child_process is mocked
 * because Stop runs pkill on macOS.
 *
 * NON_EFFECTIVE_E2E_DUMP=<file> writes each day's rows so the backend's own
 * Pulse code can be run on exactly what the desktop wrote.
 */

const fs = require('fs');
const { randomUUID } = require('crypto');

const mockDb = { timeLogs: new Map(), idleLogs: new Map(), screenshots: [] };
const mockWorld = {
  probe: { active: false, conclusive: true },
  prompts: [],
  fg: null,
  lastInputAt: 0,
  inputThisMinute: false,
  sessionStartMs: 0,
};

jest.mock('electron', () => ({
  app: { getPath: () => require('os').tmpdir(), getVersion: () => '0.0.0', isPackaged: false },
  nativeImage: {
    createFromPath: () => ({ isEmpty: () => true }),
    createFromBuffer: () => ({ isEmpty: () => true }),
  },
  net: { isOnline: () => true },
}));
jest.mock('child_process', () => ({ ...jest.requireActual('child_process'), exec: jest.fn() }));
jest.mock('../meeting-presence-probe', () => ({
  probeMeetingStillOpen: jest.fn(async () => ({ ...mockWorld.probe })),
  clearMeetingPresenceCache: jest.fn(),
}));
jest.mock('../../idle-prompt-manager', () =>
  jest.fn().mockImplementation(() => ({
    show: jest.fn((countdown) => mockWorld.prompts.push({ at: Date.now(), countdown })),
    hide: jest.fn(),
    clear: jest.fn(),
  })),
);
jest.mock('../../modules/core/cleanup-registry', () => ({
  registerResource: jest.fn(),
  registerInterval: jest.fn(),
  cleanupAll: jest.fn(),
  emergencyCleanup: jest.fn(),
}));
jest.mock('../../modules/utils/session-recovery', () => ({
  writePendingSessionClose: jest.fn(() => true),
  clearPendingSessionClose: jest.fn(),
  markUserExplicitlyStopped: jest.fn(),
  closeOpenSessionsAfterExplicitStop: jest.fn(async () => ({ closed: 0 })),
}));
jest.mock('../../modules/utils/session-audit', () => ({ sessionClosed: jest.fn() }));
jest.mock('../../modules/utils/device-id', () => ({ getDeviceId: () => 'e2e-device' }));
jest.mock('../../modules/utils/screenshot-storage', () => ({ uploadScreenshotBuffer: jest.fn() }));
jest.mock('../../modules/utils/backend-time-logs', () => ({
  isBackendTimeLogsEnabled: () => true,
  isLikelyOffline: () => false,
  upsertIdleLog: jest.fn(async (row) => {
    const prev = mockDb.idleLogs.get(row.id);
    if (!prev) {
      mockDb.idleLogs.set(row.id, { ...row });
      return row;
    }
    // UPSERT_IDLE_LOG_SQL: an existing row only grows.
    if (Date.parse(row.idle_end) > Date.parse(prev.idle_end)) prev.idle_end = row.idle_end;
    prev.duration_seconds = Math.max(prev.duration_seconds || 0, row.duration_seconds || 0);
    prev.time_log_id = prev.time_log_id || row.time_log_id;
    return prev;
  }),
  insertIdleLog: jest.fn(async () => ({})),
  updateTimeLog: jest.fn(async (id, updates) => {
    const row = mockDb.timeLogs.get(id);
    if (row) Object.assign(row, updates);
    return row;
  }),
  closeOpenUrlLogs: jest.fn(async () => ({})),
  closeOpenAppLogs: jest.fn(async () => ({})),
}));
jest.mock('../../modules/utils/backend-rds-reads', () => ({
  isBackendRdsEnabled: () => true,
  idleLogExists: jest.fn(async () => false),
  // Older backend: forces the desktop's own Pulse-rule calculation. The
  // backend step checks that figure against the real Pulse code.
  getEffectiveStats: jest.fn(async () => {
    throw new Error('Unsupported action: get_effective_stats');
  }),
  listIdleLogs: jest.fn(async () => [...mockDb.idleLogs.values()]),
}));

const EnhancedIdleMonitor = require('../../modules/activity/enhanced-idle-monitor');
const EnhancedScreenshotManager = require('../../modules/capture/enhanced-screenshot-manager');
const gracefulShutdownManager = require('../../modules/core/graceful-shutdown-manager');
const {
  setWorkTimezone,
  getWorkTimezone,
  startOfWorkDay,
  endOfWorkDayExclusive,
} = require('../../modules/utils/work-timezone');
const { computeTodayEffectiveStats } = require('../../modules/utils/today-effective-stats');
const { resolveLiveNonEffectiveSeconds } = require('../../modules/utils/effective-time');
const {
  primeMeetingPresenceOnStart,
  tagWindowTitleForMeeting,
  _resetMeetingSessionForTests,
} = require('../meeting-context');

const USER = '1195';
// Same as the production log: idle after 60s, checked every 60s, alert at 10 min.
const CONFIG = {
  user_id: USER,
  idle_detection_threshold_seconds: 60,
  idle_checkpoint_interval_seconds: 60,
  idle_threshold_minutes: 10,
  screenshot_interval_minutes: 1,
};
const T0 = Date.parse('2026-10-14T14:00:00.000Z'); // 9:00 AM Chicago
const TICK_S = 10;

const CODE = { appName: 'Code', windowTitle: 'enhanced-idle-monitor.js — alyson-time-doctor', url: null };
const MEET = {
  appName: 'Google Chrome',
  windowTitle: 'Meet - abc-defg-hij - Google Chrome',
  url: 'https://meet.google.com/abc-defg-hij',
};
const WORD = { appName: 'Microsoft Word', windowTitle: 'Notes.docx', url: null };
const NO_CALL = { active: false, conclusive: true };
const MEET_OPEN = { active: true, conclusive: true, label: 'Google Meet' };

// Input lands at the start of a tick, so N quiet minutes are N min + one tick
// without input.
const quietSeconds = (min) => min * 60 + TICK_S;
const resolveShotActivity = EnhancedScreenshotManager.prototype._resolveScreenshotActivity;
const days = [];
let monitor;

/** main.js global.stopTracking, minus tray/notifications. */
async function stopTracking(reason = 'manual', details = null, options = {}) {
  if (
    options?.authorizedIdleCut === true &&
    options?.endTimeOverride &&
    Number(options.timeCutSeconds) > 0
  ) {
    global._stopEndTimeOverride = options.endTimeOverride;
    global._stopAuthorizedIdleCut = true;
    global._idlePromptTimeCutSeconds = Math.floor(Number(options.timeCutSeconds));
  } else {
    global._stopAuthorizedIdleCut = false;
    global._idlePromptTimeCutSeconds = 0;
    global._stopEndTimeOverride = null;
    gracefulShutdownManager.captureStopMoment();
  }
  if (global._isStoppingTracking) return gracefulShutdownManager.shutdownPromise;
  global._isStoppingTracking = true;
  try {
    return await gracefulShutdownManager.gracefulStop(reason, { details });
  } finally {
    global._isStoppingTracking = false;
    global._stopEndTimeOverride = null;
  }
}

async function startTracking() {
  const id = randomUUID();
  const startIso = new Date().toISOString();
  mockDb.timeLogs.set(id, { id, user_id: USER, start_time: startIso, end_time: null, idle_seconds: 0 });
  Object.assign(global, {
    currentUserId: USER,
    isTracking: true,
    isPaused: false,
    isShuttingDown: false,
    userExplicitlyStopped: false,
    currentTimeLogId: id,
    sessionStartTime: startIso,
    currentSession: { id, start_time: startIso, user_id: USER },
  });
  global.trackingManager = {
    isTracking: true,
    currentTimeLogId: id,
    sessionStartTime: startIso,
    _stopTimeLogCheckpoint() {},
    _captureStopTodayTotalSnapshot() {},
  };
  mockWorld.sessionStartMs = Date.now();
  monitor.resetSessionIdleSeconds();
  monitor.setTrackingState(true);
  monitor.startIdleMonitoring();
  await primeMeetingPresenceOnStart();
}

async function captureShot() {
  const input = mockWorld.inputThisMinute;
  mockWorld.inputThisMinute = false;
  const activity = input ? { keys: 30, clicks: 10, moves: 150 } : { keys: 0, clicks: 0, moves: 0 };
  const { appName, windowTitle, url } = mockWorld.fg;
  const { activityPercent, meetingLabel } = await resolveShotActivity.call(
    {},
    activity,
    appName,
    windowTitle,
    url,
  );
  mockDb.screenshots.push({
    user_id: USER,
    time_log_id: global.currentTimeLogId,
    captured_at: new Date().toISOString(),
    activity_percent: activityPercent,
    app_name: appName,
    window_title: tagWindowTitleForMeeting(windowTitle, meetingLabel),
  });
}

/**
 * 'start' / 'stop', or { min, input, fg, probe }: `min` minutes with (input)
 * or without keyboard/mouse, `fg` in front, `probe` = what the tab probe sees.
 */
async function play(script) {
  for (const step of script) {
    if (step === 'start') {
      await startTracking();
      continue;
    }
    if (step === 'stop') {
      await global.stopTracking('manual');
      await jest.advanceTimersByTimeAsync(1000);
      continue;
    }
    if (step.fg) mockWorld.fg = step.fg;
    if (step.probe) mockWorld.probe = step.probe;
    for (let s = 0; s < Math.round(step.min * 60); s += TICK_S) {
      if (step.input) {
        mockWorld.lastInputAt = Date.now();
        mockWorld.inputThisMinute = true;
      }
      await jest.advanceTimersByTimeAsync(TICK_S * 1000);
      if (global.isTracking && (Date.now() - mockWorld.sessionStartMs) % 60000 === 30000) {
        await captureShot();
      }
    }
  }
  await jest.advanceTimersByTimeAsync(1000);
}

async function finishDay(name) {
  const timeLogs = [...mockDb.timeLogs.values()].map((r) => ({ ...r }));
  const totalSeconds = timeLogs.reduce(
    (acc, r) =>
      acc + (r.end_time ? Math.round((Date.parse(r.end_time) - Date.parse(r.start_time)) / 1000) : 0),
    0,
  );
  const stats = await computeTodayEffectiveStats({
    userId: USER,
    totalSeconds,
    screenshots: mockDb.screenshots,
    timeLogs,
    config: CONFIG,
  });
  const card = resolveLiveNonEffectiveSeconds({ pulseNonEffective: stats.nonEffectiveSeconds });
  const day = {
    name,
    userId: USER,
    tz: getWorkTimezone(),
    startIso: startOfWorkDay().toISOString(),
    endIso: endOfWorkDayExclusive().toISOString(),
    intervalMinutes: CONFIG.screenshot_interval_minutes,
    totalSeconds,
    prompts: mockWorld.prompts.length,
    time_logs: timeLogs,
    idle_logs: [...mockDb.idleLogs.values()].map((r) => ({ ...r })),
    screenshots: mockDb.screenshots.map((r) => ({ ...r })),
    desktop: {
      source: stats.source,
      idleSeconds: stats.idleSeconds,
      lowActivitySeconds: stats.lowActivitySeconds,
      nonEffectiveSeconds: stats.nonEffectiveSeconds,
      card,
    },
  };
  days.push(day);
  return day;
}

describe('non-effective end to end (desktop)', () => {
  const previousTz = getWorkTimezone();

  beforeAll(() => {
    setWorkTimezone('America/Chicago');
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterAll(() => {
    setWorkTimezone(previousTz);
    jest.restoreAllMocks();
    if (process.env.NON_EFFECTIVE_E2E_DUMP) {
      fs.writeFileSync(process.env.NON_EFFECTIVE_E2E_DUMP, JSON.stringify(days, null, 2));
    }
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(T0);
    mockDb.timeLogs.clear();
    mockDb.idleLogs.clear();
    mockDb.screenshots.length = 0;
    mockWorld.prompts.length = 0;
    mockWorld.probe = NO_CALL;
    mockWorld.fg = CODE;
    mockWorld.lastInputAt = Date.now();
    mockWorld.inputThisMinute = false;
    _resetMeetingSessionForTests();
    global.appSettings = null;
    global.config = CONFIG;
    global.stopTracking = stopTracking;
    global.unifiedInputManager = {
      getIdleTime: () => Math.floor((Date.now() - mockWorld.lastInputAt) / 1000),
      stats: { keystrokes: 0, mouseClicks: 0, mouseMovements: 0 },
    };
    monitor = new EnhancedIdleMonitor({ ...CONFIG });
    global.enhancedIdleMonitor = monitor;
  });

  afterEach(async () => {
    await monitor.stopIdleMonitoring();
    jest.useRealTimers();
    for (const key of ['trackingManager', 'currentSession', 'enhancedIdleMonitor', 'unifiedInputManager']) {
      delete global[key];
    }
    global.isTracking = false;
    global.currentTimeLogId = null;
  });

  it('listen-only Google Meet on Mac: quiet stretches inside the call are effective', async () => {
    await play([
      'start',
      { min: 10, input: true, fg: CODE },
      { min: 0.5, input: true, fg: MEET, probe: MEET_OPEN },
      { min: 8 },
      { min: 1 / 6, input: true },
      { min: 8 },
      { min: 1 / 6, input: true },
      { min: 5, input: true, fg: CODE, probe: NO_CALL },
      'stop',
    ]);
    const day = await finishDay('meet-listen-only-mac');

    expect(day.idle_logs).toHaveLength(0);
    expect(day.desktop.card).toBe(0);
    expect(day.totalSeconds).toBeGreaterThan(31 * 60);
  });

  it('Word in front while the Meet tab runs in the background (Mac probe sees it)', async () => {
    await play([
      'start',
      { min: 5, input: true, fg: CODE },
      { min: 0.5, input: true, fg: MEET, probe: MEET_OPEN },
      { min: 7, fg: WORD },
      { min: 3, input: true, fg: WORD },
      'stop',
    ]);
    const day = await finishDay('meet-background-word-front-mac');

    expect(day.idle_logs).toHaveLength(0);
    const wordShots = day.screenshots.filter((s) => s.app_name === 'Microsoft Word');
    expect(wordShots.length).toBeGreaterThan(0);
    for (const shot of wordShots) {
      expect(shot.window_title).toBe('Notes.docx · Google Meet');
      expect(shot.activity_percent).toBeGreaterThanOrEqual(50);
    }
    expect(day.desktop.card).toBe(0);
  });

  it('Windows probe misses the background Meet, quiet within 10 min of a Meet shot: effective', async () => {
    await play([
      'start',
      { min: 5, input: true, fg: CODE },
      { min: 1, input: true, fg: MEET, probe: NO_CALL },
      { min: 6, fg: WORD },
      { min: 3, input: true, fg: WORD },
      'stop',
    ]);
    const day = await finishDay('meet-background-windows-probe-miss-near-shot');

    // The desktop writes the row; the Meet screenshot's call window removes it.
    expect(day.idle_logs).toHaveLength(1);
    expect(day.desktop.card).toBe(0);
  });

  it('Windows probe misses the background Meet, quiet long after the last Meet shot: idle', async () => {
    await play([
      'start',
      { min: 5, input: true, fg: CODE },
      { min: 1, input: true, fg: MEET, probe: NO_CALL },
      { min: 12, input: true, fg: WORD },
      { min: 7 },
      { min: 3, input: true },
      'stop',
    ]);
    const day = await finishDay('meet-background-windows-probe-miss-far-from-shot');

    expect(day.idle_logs).toHaveLength(1);
    expect(day.desktop.card).toBeGreaterThanOrEqual(6 * 60);
    expect(day.desktop.card).toBeLessThanOrEqual(quietSeconds(7));
  });

  it('away 7 minutes with no call: counted once, never past the return', async () => {
    await play([
      'start',
      { min: 10, input: true, fg: CODE },
      { min: 7 },
      { min: 5, input: true },
      'stop',
    ]);
    const day = await finishDay('away-7m-no-call');

    expect(day.idle_logs).toHaveLength(1);
    expect(day.desktop.card).toBeGreaterThanOrEqual(6 * 60);
    expect(day.desktop.card).toBeLessThanOrEqual(quietSeconds(7));
  });

  it('three 3-minute pauses: saved raw, never non-effective', async () => {
    await play([
      'start',
      { min: 5, input: true, fg: CODE },
      { min: 3 },
      { min: 2, input: true },
      { min: 3 },
      { min: 2, input: true },
      { min: 3 },
      { min: 2, input: true },
      'stop',
    ]);
    const day = await finishDay('three-3m-pauses');

    expect(day.idle_logs).toHaveLength(3);
    for (const row of day.idle_logs) expect(row.duration_seconds).toBeLessThan(5 * 60);
    expect(day.desktop.card).toBe(0);
  });

  it('a 4-minute pause stays under the 5-minute idle floor; only its 0% screenshots count', async () => {
    await play([
      'start',
      { min: 5, input: true, fg: CODE },
      { min: 4 },
      { min: 3, input: true },
      'stop',
    ]);
    const day = await finishDay('one-4m-pause');

    expect(day.idle_logs).toHaveLength(1);
    expect(day.idle_logs[0].duration_seconds).toBeGreaterThanOrEqual(3 * 60);
    expect(day.idle_logs[0].duration_seconds).toBeLessThanOrEqual(quietSeconds(4));
    expect(day.desktop.idleSeconds).toBe(0);
    // Pulse's 3-minute low-activity run, not idle.
    expect(day.desktop.card).toBe(day.desktop.lowActivitySeconds);
    expect(day.desktop.card).toBeLessThanOrEqual(4 * 60);
  });

  it('unanswered still-working alert, no call: the cut 10 minutes are not non-effective', async () => {
    await play([
      'start',
      { min: 20, input: true, fg: CODE },
      { min: 13 },
    ]);
    const day = await finishDay('alert-timeout-no-call');

    expect(day.prompts).toBe(1);
    const [log] = day.time_logs;
    expect(log.authorized_idle_cut).toBe(true);
    const endMs = Date.parse(log.end_time);
    for (const row of day.idle_logs) {
      expect(Date.parse(row.idle_end)).toBeLessThanOrEqual(endMs);
      expect(row.duration_seconds).toBeLessThan(5 * 60);
    }
    expect(day.desktop.idleSeconds).toBe(0);
    expect(day.desktop.card).toBe(0);
  });

  it('unanswered alert during a call (Mac): time is cut, nothing is non-effective', async () => {
    await play([
      'start',
      { min: 5, input: true, fg: CODE },
      { min: 0.5, input: true, fg: MEET, probe: MEET_OPEN },
      { min: 13 },
    ]);
    const day = await finishDay('alert-timeout-in-call-mac');

    expect(day.prompts).toBe(1);
    expect(day.time_logs[0].authorized_idle_cut).toBe(true);
    expect(day.idle_logs).toHaveLength(0);
    expect(day.desktop.card).toBe(0);
  });

  it('Stop pressed after 6 quiet minutes in a call (Mac)', async () => {
    await play([
      'start',
      { min: 5, input: true, fg: CODE },
      { min: 0.5, input: true, fg: MEET, probe: MEET_OPEN },
      { min: 6 },
      'stop',
    ]);
    const day = await finishDay('stop-in-call-mac');

    expect(day.idle_logs).toHaveLength(0);
    expect(day.desktop.card).toBe(0);
  });
});
