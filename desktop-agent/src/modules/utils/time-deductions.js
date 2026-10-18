/**
 * Screenshot deletes take time off the session they were in (Pulse:
 * time_logs.deducted_seconds, off the session-start work day). A closed
 * session's deduction is already out of the read's closed total. The live
 * session's clock is now − Start, so its deduction is held here by id and
 * subtracted wherever the live total is measured.
 */

function asSeconds(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function liveDeductionSeconds(timeLogId, g = global) {
  const d = g._liveSessionDeduction;
  if (!d || !timeLogId || String(d.id) !== String(timeLogId)) return 0;
  return asSeconds(d.seconds);
}

/**
 * Deductions only grow, so a read that predates a delete cannot undo it.
 * Returns the growth this device did not apply itself (a delete in Pulse or
 * on another device). The first read of a session only seeds it: after a
 * relaunch its deduction is already in last-good.
 */
function noteLiveDeductionFromServer(timeLogId, seconds, g = global) {
  if (!timeLogId) return 0;
  const known = !!g._liveSessionDeduction && String(g._liveSessionDeduction.id) === String(timeLogId);
  const prev = liveDeductionSeconds(timeLogId, g);
  const next = Math.max(prev, asSeconds(seconds));
  g._liveSessionDeduction = { id: String(timeLogId), seconds: next };
  return known ? next - prev : 0;
}

/**
 * Last-good is Start's closed base and the floor every read is held to.
 * Totals and deductions move together, so a later floor check sees this
 * delete as already applied and does not subtract it a second time.
 */
function lowerLastGood(d, onLive, g = global) {
  const lastGood = g._lastGoodTodayStats;
  if (!lastGood || typeof lastGood !== 'object') return;
  const lower = (v) => Math.max(0, asSeconds(v) - d);
  g._lastGoodTodayStats = {
    ...lastGood,
    totalTime: lower(lastGood.totalTime),
    deductedSeconds: asSeconds(lastGood.deductedSeconds) + d,
    ...(onLive
      ? { liveDeductedSeconds: asSeconds(lastGood.liveDeductedSeconds) + d }
      : {
          completedTodayBeforeCurrentSessionSeconds: lower(
            lastGood.completedTodayBeforeCurrentSessionSeconds,
          ),
        }),
  };
  try {
    require('./today-time-log-stats').writePersistedLastGood(g._lastGoodTodayStats);
  } catch (_) { /* in-memory floor is already lowered */ }
}

/**
 * A delete the server accepted, applied now instead of at the next Stop:
 * every forward-only floor drops by exactly the deducted seconds. Only once
 * the server reports deductions — otherwise its raw total would push the
 * clock back up and the two would see-saw.
 */
function applyAuthorizedDeduction({ seconds, timeLogId = null, timeLogStartTime = null, g = global } = {}) {
  const d = asSeconds(seconds);
  if (d <= 0 || g._backendReportsDeductions !== true) return { applied: 0 };
  const tm = g.trackingManager;
  const tracking = !!(g.isTracking || tm?.isTracking);
  const liveId = tm?.currentTimeLogId || g.currentTimeLogId || null;
  const onLive = !!(tracking && liveId && timeLogId && String(liveId) === String(timeLogId));
  // Pulse charges a delete to the day its session started. Another day's
  // session must not take time off today's clock.
  const startIso = timeLogStartTime || (onLive ? tm?.sessionStartTime || g.sessionStartTime : null);
  if (isTodaysTimeLog({ timeLogId, timeLogStartTime: startIso, g }) === false) {
    return { applied: 0, otherDay: true };
  }
  const lower = (v) => Math.max(0, asSeconds(v) - d);

  recordLocalDeduction({ seconds: d, onLive, liveId, timeLogId, g });

  if (onLive) {
    g._liveSessionDeduction = { id: String(liveId), seconds: liveDeductionSeconds(liveId, g) + d };
  } else if (tracking && g.trayManager) {
    g.trayManager._cumulativeBaseSeconds = lower(g.trayManager._cumulativeBaseSeconds);
    g._authorizedClosedDropSeconds = asSeconds(g._authorizedClosedDropSeconds) + d;
  }
  for (const key of [
    '_trayTodayHighWaterSeconds',
    '_lastTodayTotalAtStop',
    '_rendererFrozenTotalAtStop',
    '_rendererTodayFloorSeconds',
  ]) {
    if (g[key] != null) g[key] = lower(g[key]);
  }
  lowerLastGood(d, onLive, g);
  // Drop the menu-bar total now. Leave the 1s timer running so the next
  // second continues from this number.
  try {
    g.trayManager?.paintLiveTotal?.();
  } catch (_) { /* title refresh is best-effort */ }
  return { applied: d, onLive };
}

/**
 * How long a delete this device made outranks reads that do not show it yet.
 * After that the server's own deducted_seconds is the truth again, so a delete
 * the server attributed elsewhere cannot keep today short for good.
 */
const LOCAL_DEDUCTION_TRUST_MS = 5 * 60_000;

function currentWorkDate() {
  try {
    return require('./work-timezone').workDateKey();
  } catch (_) {
    return null;
  }
}

/**
 * Today's screenshot deductions as this device knows them: the server's
 * deducted_seconds, plus any delete accepted since that a read may not show
 * yet. live is the part that belongs to the running session (liveId).
 */
function deductionLedger(g = global, workDate = currentWorkDate()) {
  const l = g._todayDeductionLedger;
  if (!l || l.workDate !== workDate) {
    // ids: sessions started today that reads have shown. byLog: their
    // deducted_seconds as last seen (only rows that carry the field).
    g._todayDeductionLedger = {
      workDate,
      total: 0,
      live: 0,
      liveId: null,
      localUntil: 0,
      ids: {},
      byLog: {},
      readSeen: false,
    };
  }
  return g._todayDeductionLedger;
}

/**
 * Does this session count toward today (its start's work day)? true/false
 * when known; null before this device has read today's sessions.
 */
function isTodaysTimeLog({ timeLogId = null, timeLogStartTime = null, g = global, workDate = currentWorkDate() } = {}) {
  if (timeLogStartTime) {
    const ms = new Date(timeLogStartTime).getTime();
    if (Number.isFinite(ms)) {
      try {
        return require('./work-timezone').workDateKey(new Date(ms)) === workDate;
      } catch (_) { /* fall through to what reads have shown */ }
    }
  }
  const l = deductionLedger(g, workDate);
  if (timeLogId && l.ids[String(timeLogId)]) return true;
  return l.readSeen ? false : null;
}

function recordLocalDeduction({
  seconds,
  onLive = false,
  liveId = null,
  timeLogId = null,
  g = global,
  now = Date.now(),
} = {}) {
  const d = asSeconds(seconds);
  if (d <= 0) return;
  const l = deductionLedger(g);
  l.total += d;
  // Only bump a session a read has shown; an unseen one is seeded from the
  // server's own value later, never counted as new growth.
  const key = timeLogId != null ? String(timeLogId) : null;
  if (key && Object.prototype.hasOwnProperty.call(l.byLog, key)) l.byLog[key] += d;
  if (onLive && liveId) {
    if (String(l.liveId) !== String(liveId)) {
      l.liveId = String(liveId);
      l.live = 0;
    }
    l.live += d;
  }
  l.localUntil = now + LOCAL_DEDUCTION_TRUST_MS;
}

/**
 * Bring one today-stats read up to every delete this device knows about.
 * A read that started before a delete is short of it by exactly the missing
 * seconds, so those come off its totals here — no guessing from how far the
 * total moved. Returns the read's totals and the deductions they now include.
 */
function applyKnownDeductionsToRead({
  totalTime = 0,
  closedSeconds = 0,
  deductedSeconds = 0,
  liveDeductedSeconds = 0,
  isTracking = false,
  liveId = null,
  workDate = currentWorkDate(),
  now = Date.now(),
  g = global,
} = {}) {
  let total = asSeconds(totalTime);
  let closed = asSeconds(closedSeconds);
  let deducted = asSeconds(deductedSeconds);
  let liveDeducted = isTracking ? asSeconds(liveDeductedSeconds) : 0;
  const l = deductionLedger(g, workDate);
  const onSameLive = !!(isTracking && liveId && l.liveId && String(l.liveId) === String(liveId));
  if (now < l.localUntil && l.total > deducted) {
    const missing = l.total - deducted;
    const missingLive = onSameLive ? Math.min(missing, Math.max(0, l.live - liveDeducted)) : 0;
    total = Math.max(0, total - missing);
    closed = Math.max(0, closed - (missing - missingLive));
    deducted = l.total;
    liveDeducted += missingLive;
  } else {
    l.total = deducted;
    l.live = onSameLive ? liveDeducted : 0;
    l.localUntil = 0;
  }
  return { totalTime: total, closedSeconds: closed, deductedSeconds: deducted, liveDeductedSeconds: liveDeducted };
}

/**
 * A floor saved before some deductions were known, restated under the
 * deductions known now. Forward-only checks compare like with like this way:
 * a delete lowers both sides, and a Stop that moves the live session's
 * deduction into the closed total lowers the old closed floor with it.
 */
function floorUnderCurrentDeductions(floorSeconds, deductedAtFloor, deductedNow) {
  const grown = Math.max(0, asSeconds(deductedNow) - asSeconds(deductedAtFloor));
  return Math.max(0, asSeconds(floorSeconds) - grown);
}

/**
 * Learn today's sessions and their deducted_seconds from a read. Returns the
 * growth on closed sessions this device did not apply itself — a delete made
 * in Pulse, or by another device. The live session's growth is not in it:
 * that one comes off elapsed through noteLiveDeductionFromServer.
 */
function noteServerLogDeductions(rows, {
  liveId = null,
  isTracking = false,
  workDate = currentWorkDate(),
  now = Date.now(),
  g = global,
} = {}) {
  const l = deductionLedger(g, workDate);
  let dayStart;
  let dayEnd;
  try {
    const wt = require('./work-timezone');
    dayStart = wt.startOfWorkDay().getTime();
    dayEnd = wt.endOfWorkDayExclusive().getTime();
  } catch (_) {
    return { closedGrowth: 0 };
  }
  const trustLocal = now < l.localUntil;
  let closedGrowth = 0;
  for (const row of rows || []) {
    if (!row?.id || !row.start_time) continue;
    const start = new Date(row.start_time).getTime();
    if (!(start >= dayStart && start < dayEnd)) continue;
    const key = String(row.id);
    l.ids[key] = true;
    if (!Object.prototype.hasOwnProperty.call(row, 'deducted_seconds')) continue;
    const server = asSeconds(row.deducted_seconds);
    if (!Object.prototype.hasOwnProperty.call(l.byLog, key)) {
      l.byLog[key] = server;
      continue;
    }
    const seen = l.byLog[key];
    const isLive = !!(isTracking && liveId && String(liveId) === key);
    if (server > seen) {
      if (!isLive) closedGrowth += server - seen;
      l.byLog[key] = server;
    } else if (server < seen && !trustLocal) {
      // Our own delete never showed up on the server. Its time stays counted.
      l.byLog[key] = server;
    }
  }
  l.readSeen = true;
  return { closedGrowth };
}

/**
 * A deduction learned from the server: lower every forward-only floor by
 * exactly that, as for a delete made here. Last-good too: a read that went
 * down is not saved over it until reads settle, and Start takes its closed
 * base from it. A live one comes off elapsed, so the tray base stays.
 */
function applyServerClosedDeduction(seconds, g = global, { onLive = false } = {}) {
  const d = asSeconds(seconds);
  if (d <= 0) return 0;
  const lower = (v) => Math.max(0, asSeconds(v) - d);
  const tracking = !!(g.isTracking || g.trackingManager?.isTracking);
  if (!onLive && tracking && g.trayManager) {
    g.trayManager._cumulativeBaseSeconds = lower(g.trayManager._cumulativeBaseSeconds);
  }
  for (const key of [
    '_trayTodayHighWaterSeconds',
    '_lastTodayTotalAtStop',
    '_rendererFrozenTotalAtStop',
    '_rendererTodayFloorSeconds',
  ]) {
    if (g[key] != null) g[key] = lower(g[key]);
  }
  lowerLastGood(d, onLive, g);
  try {
    g.trayManager?.paintLiveTotal?.();
  } catch (_) { /* next tick paints it */ }
  return d;
}

function reconcileForwardBase(prev, incoming, pendingDrop = 0) {
  const p = asSeconds(prev);
  const n = asSeconds(incoming);
  let pending = asSeconds(pendingDrop);
  if (pending > 0 && n > p && n - p <= pending + 5) {
    return { base: p, pending };
  }
  if (pending > 0 && p > n && p - n <= pending + 5) {
    pending = Math.max(0, pending - (p - n));
    return { base: n, pending };
  }
  if (n > 0 || p <= 0) return { base: Math.max(p, n), pending };
  return { base: p, pending };
}

module.exports = {
  liveDeductionSeconds,
  noteLiveDeductionFromServer,
  applyAuthorizedDeduction,
  recordLocalDeduction,
  isTodaysTimeLog,
  noteServerLogDeductions,
  applyServerClosedDeduction,
  applyKnownDeductionsToRead,
  floorUnderCurrentDeductions,
  reconcileForwardBase,
};
