/**
 * Lid-down / sleep must not be billed.
 *
 * The live clock is wall-clock (now − Start). After the OS freezes, that
 * formula includes the nap. Windows often delivers suspend+resume in the same
 * tick after wake, so "asleep for 0 minutes" is a lie — last proof-of-life is
 * the only honest end.
 */

/** Missed ~6×10s checkpoints, or ~1 idle-monitor interval. */
const SLEEP_GAP_MS = 60 * 1000;

function msOf(value) {
  if (value == null || value === '') return NaN;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function isSleepGap(lastProofAt, nowMs = Date.now(), gapMs = SLEEP_GAP_MS) {
  const proof = msOf(lastProofAt);
  if (!Number.isFinite(proof)) return false;
  return nowMs - proof > gapMs;
}

/**
 * End time for a sleep stop. If the last checkpoint is older than a sleep gap,
 * the process was frozen — use that mark, never wake-time NOW.
 */
function sleepSafeEndIso({
  lastCheckpointAt,
  checkpointTimeLogId,
  timeLogId,
  nowIso,
} = {}) {
  const now = nowIso || new Date().toISOString();
  if (!lastCheckpointAt) return now;
  if (
    timeLogId &&
    checkpointTimeLogId &&
    String(checkpointTimeLogId) !== String(timeLogId)
  ) {
    return now;
  }
  if (isSleepGap(lastCheckpointAt, msOf(now))) {
    const proof = msOf(lastCheckpointAt);
    return new Date(proof).toISOString();
  }
  return now;
}

/**
 * A wall-clock jump between two awake ticks (intervalMs apart) that was the
 * machine asleep. macOS/Linux monotonic time stops while asleep but keeps
 * running through App Nap and event-loop stalls, so an awake-but-throttled
 * app (the user may be working) is never mistaken for sleep. Windows has no
 * App Nap.
 */
function isSleepTickGap({
  prevWallMs,
  wallMs,
  prevMonoMs,
  monoMs,
  intervalMs = 0,
  platform = process.platform,
  gapMs = SLEEP_GAP_MS,
} = {}) {
  const prev = Number(prevWallMs);
  if (!(prev > 0)) return false;
  const wallGap = Number(wallMs) - prev;
  if (!(wallGap > (Number(intervalMs) || 0) + gapMs)) return false;
  if (platform === 'win32') return true;
  const monoGap = Number(monoMs) - Number(prevMonoMs);
  if (!Number.isFinite(monoGap)) return true;
  return wallGap - monoGap > gapMs;
}

function monotonicMs() {
  try {
    return Number(process.hrtime.bigint() / 1000000n);
  } catch (_) {
    return NaN;
  }
}

/**
 * Record one awake tick (main-process 1s clock). On a sleep gap, remembers
 * the nap as global._lastSleepWindow and returns the last pre-nap tick.
 */
function noteAwakeTick({ g = global, wallMs = Date.now(), monoMs = monotonicMs(), platform } = {}) {
  const prevWallMs = Number(g._lastAwakeTickMs) || 0;
  const prevMonoMs = g._lastAwakeTickMonoMs;
  g._lastAwakeTickMs = wallMs;
  g._lastAwakeTickMonoMs = monoMs;
  const slept = isSleepTickGap({ prevWallMs, wallMs, prevMonoMs, monoMs, platform });
  if (slept) g._lastSleepWindow = { fromMs: prevWallMs, toMs: wallMs };
  return { slept, lastAwakeMs: slept ? prevWallMs : wallMs };
}

function resetAwakeClock(g = global) {
  g._lastAwakeTickMs = 0;
  g._lastAwakeTickMonoMs = NaN;
}

/**
 * End proof for a sleep stop: the latest awake mark inside this session.
 * Marks from before Start belong to an earlier nap (would close this session
 * at zero length). If this session just woke from a nap, the nap's start is
 * the end — anything later is wake time. An old nap the session outlived
 * (its close failed) must not erase the hours worked since.
 */
function latestAwakeProofMs({
  candidates = [],
  sessionStart = null,
  sleepWindow = null,
  nowMs = Date.now(),
} = {}) {
  const start = msOf(sessionStart);
  const napFrom = msOf(sleepWindow?.fromMs);
  const napTo = msOf(sleepWindow?.toMs);
  const justWoke = Number.isFinite(napTo) && nowMs - napTo <= STOP_END_MAX_AGE_MS;
  if (justWoke && Number.isFinite(start) && Number.isFinite(napFrom) && napFrom >= start) {
    return napFrom;
  }
  let best = NaN;
  for (const c of candidates) {
    const t = msOf(c);
    if (!Number.isFinite(t)) continue;
    if (Number.isFinite(start) && t < start) continue;
    if (!Number.isFinite(best) || t > best) best = t;
  }
  return best;
}

/** A captured Stop moment older than this is a leftover, not this Stop. */
const STOP_END_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * The pending Stop end is a sleep stop's last-awake mark. Only true while the
 * override still equals the mark, so any reset or replacement drops it.
 */
function hasSleepSafeStopEnd(g = global) {
  return !!g._sleepSafeStopEndIso && g._stopEndTimeOverride === g._sleepSafeStopEndIso;
}

/** Drop a leftover Stop end before a fresh capture — never a sleep mark. */
function resetStopEndOverride(g = global) {
  if (!hasSleepSafeStopEnd(g)) g._stopEndTimeOverride = null;
}

/**
 * End a Stop bills. The captured Stop moment wins while fresh. A sleep stop's
 * last-awake mark wins at any age — the process was frozen in between, so
 * wake-time NOW would bill the nap (Om 14 Oct: four naps, +2h02m).
 * Anything outside [sessionStart, now] belongs to another stop.
 */
function resolveStopEndMs({
  frozenEnd,
  sessionStart,
  nowMs = Date.now(),
  sleepSafe = false,
} = {}) {
  const frozen = msOf(frozenEnd);
  if (!Number.isFinite(frozen) || frozen > nowMs) return nowMs;
  const start = msOf(sessionStart);
  if (Number.isFinite(start) && frozen < start) return nowMs;
  if (nowMs - frozen <= STOP_END_MAX_AGE_MS) return frozen;
  return sleepSafe ? frozen : nowMs;
}

function isSleepStopReason(reason) {
  return reason === 'system_sleep' || reason === 'suspend';
}

/**
 * Total to freeze on the clock at Stop. A sleep stop trusts main's total to
 * the last awake moment: a renderer tick at wake may already have painted the
 * nap. Only the shown idle prompt may cut, and only by its own seconds.
 */
function resolveStopHintSeconds({
  reason,
  frozenSeconds = 0,
  liveHighSeconds = 0,
  cutSeconds = 0,
} = {}) {
  const frozen = Math.max(0, Math.floor(Number(frozenSeconds) || 0));
  const live = Math.max(0, Math.floor(Number(liveHighSeconds) || 0));
  const cut = Math.max(0, Math.floor(Number(cutSeconds) || 0));
  if (reason === 'idle_timeout' && cut > 0) return Math.max(frozen, Math.max(0, live - cut));
  if (isSleepStopReason(reason) && frozen > 0) return frozen;
  // A couple of seconds of tray/renderer skew stays. Minutes above the click
  // snapshot are screenshot deductions the window never dropped — Stop was
  // jumping back up to that old total.
  if (frozen > 0 && live > frozen + 5) return frozen;
  return Math.max(live, frozen);
}

/**
 * Stopped clock from a stats read. A settled read (server has every second)
 * is the server total exactly and may move the clock down. Otherwise the Stop
 * total holds until the server catches up — a read can land before the close.
 */
function resolveStoppedClockSeconds({
  dbSeconds = 0,
  stopFloorSeconds = 0,
  settled = false,
  capSeconds = null,
} = {}) {
  const cap = capSeconds != null && Number.isFinite(Number(capSeconds))
    ? Math.floor(Number(capSeconds))
    : Infinity;
  const db = Math.min(Math.max(0, Math.floor(Number(dbSeconds) || 0)), cap);
  if (settled) return db;
  const stop = Math.max(0, Math.floor(Number(stopFloorSeconds) || 0));
  return stop > db && stop <= cap ? stop : db;
}

/** After wake, elapsed starts at lastWake — never at a Start that predates sleep. */
function effectiveSessionStart(sessionStart, lastWakeMs) {
  const startMs = msOf(sessionStart);
  if (!Number.isFinite(startMs)) return sessionStart;
  const wake = Number(lastWakeMs);
  if (Number.isFinite(wake) && wake > startMs) return new Date(wake);
  return sessionStart;
}

function elapsedSecondsExcludingSleep(sessionStart, nowMs = Date.now(), lastWakeMs = 0) {
  const start = effectiveSessionStart(sessionStart, lastWakeMs);
  const startMs = msOf(start);
  if (!Number.isFinite(startMs)) return 0;
  return Math.max(0, Math.floor((nowMs - startMs) / 1000));
}

/** Leftover tray high-water must not become the post-sleep closed base. */
function closedBaseAfterSleep(dbCompletedSeconds) {
  return Math.max(0, Math.floor(Number(dbCompletedSeconds) || 0));
}

/**
 * Closed base for a new Start paint.
 * Never flash 00:00:00 when today's last-good total is already on screen.
 * Only discard the "since midnight" orphan when there is no completed floor
 * and no Stop-click / last-painted Continue total.
 */
/**
 * Recover-after-idle reused the original Start. The idle Stop's seconds then
 * sit in closedBase AND in (now − originalStart) — Hamza 29 Sep showed
 * 3h16m (3787+8026) then snapped to 2h14m. Strip this session's own Stop
 * out of closedBase. A new Start after Stop has sessionStart >= lastStop
 * and is unchanged.
 */
function excludeOwnSessionFromClosedBase({
  closedBase = 0,
  sessionStart,
  lastStopAt,
} = {}) {
  const closed = Math.max(0, Math.floor(Number(closedBase) || 0));
  const startMs = msOf(sessionStart);
  const stopMs = msOf(lastStopAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(stopMs)) return closed;
  if (startMs >= stopMs - 2000) return closed;
  const own = Math.max(0, Math.floor((stopMs - startMs) / 1000));
  const remain = Math.max(0, closed - Math.min(closed, own));
  // Idle-cut vs painted Stop floor often differs by a few seconds.
  if (remain > 0 && remain <= 30) return 0;
  return remain;
}

function resolveLiveTrackedSeconds({
  closedBase = 0,
  sessionStart,
  lastStopAt,
  nowMs = Date.now(),
  lastWakeMs = 0,
} = {}) {
  const closed = excludeOwnSessionFromClosedBase({
    closedBase,
    sessionStart,
    lastStopAt,
  });
  const live = elapsedSecondsExcludingSleep(sessionStart, nowMs, lastWakeMs);
  return closed + live;
}

function resolveClosedBaseForStart({
  closedBase = 0,
  stopFloor = 0,
  lastPainted = 0,
  liveElapsed = 0,
  nearWorkDayCap = false,
} = {}) {
  const closed = Math.max(0, Math.floor(Number(closedBase) || 0));
  const stop = Math.max(0, Math.floor(Number(stopFloor) || 0));
  const painted = Math.max(0, Math.floor(Number(lastPainted) || 0));
  const elapsed = Math.max(0, Math.floor(Number(liveElapsed) || 0));
  const completed = Math.max(closed, stop);
  if (completed > 0) return completed;
  const implied = Math.max(0, painted - elapsed);
  // Orphan leftover ≈ wall-clock since midnight, and nothing was actually
  // closed today. A real 1h Stop→Start must keep last-painted via stopFloor.
  if (nearWorkDayCap && implied > 180) return 0;
  return implied;
}

/**
 * Stopped + local clock ≫ DB. Classic leftover after lid-sleep / new day.
 * Requires a completed DB read (dbHydrated) so offline unsynced hours are kept.
 */
function isPhantomStoppedTotal(localSeconds, dbSeconds, dbHydrated) {
  const local = Math.max(0, Math.floor(Number(localSeconds) || 0));
  const db = Math.max(0, Math.floor(Number(dbSeconds) || 0));
  if (!dbHydrated) return false;
  if (local <= 0) return false;
  return local > db + 180;
}

module.exports = {
  SLEEP_GAP_MS,
  msOf,
  isSleepGap,
  sleepSafeEndIso,
  isSleepTickGap,
  monotonicMs,
  noteAwakeTick,
  resetAwakeClock,
  latestAwakeProofMs,
  STOP_END_MAX_AGE_MS,
  hasSleepSafeStopEnd,
  resetStopEndOverride,
  resolveStopEndMs,
  isSleepStopReason,
  resolveStopHintSeconds,
  resolveStoppedClockSeconds,
  effectiveSessionStart,
  elapsedSecondsExcludingSleep,
  closedBaseAfterSleep,
  resolveClosedBaseForStart,
  excludeOwnSessionFromClosedBase,
  resolveLiveTrackedSeconds,
  isPhantomStoppedTotal,
};
