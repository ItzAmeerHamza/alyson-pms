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
  isPhantomStoppedTotal,
};
