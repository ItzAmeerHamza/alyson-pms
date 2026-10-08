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
  effectiveSessionStart,
  elapsedSecondsExcludingSleep,
  closedBaseAfterSleep,
  resolveClosedBaseForStart,
  excludeOwnSessionFromClosedBase,
  resolveLiveTrackedSeconds,
  isPhantomStoppedTotal,
};
