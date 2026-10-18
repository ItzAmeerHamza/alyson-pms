/**
 * After a close or offline flush reaches the server, ask the stopped renderer
 * for one fresh read. A settled read then replaces any Stop floor, so the
 * tray equals Pulse instead of holding a stale total for the rest of the day.
 * Waits out the post-sync grace, in which a read may predate the last write.
 */

const MIN_DELAY_MS = 3000;

let timer = null;

function isTracking(g) {
  return !!(g.isTracking || g.trackingManager?.isTracking);
}

function scheduleSettledReconcile({ delayMs = MIN_DELAY_MS, g = global } = {}) {
  if (timer) clearTimeout(timer);
  const graceLeft = Math.max(0, (Number(g._postOfflineSyncGraceUntil) || 0) - Date.now());
  const wait = Math.max(delayMs, graceLeft > 0 ? graceLeft + 1000 : 0);
  timer = setTimeout(() => {
    timer = null;
    if (isTracking(g)) return;
    if ((Number(g._postOfflineSyncGraceUntil) || 0) > Date.now()) {
      scheduleSettledReconcile({ delayMs, g });
      return;
    }
    const win = g.mainWindow;
    if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) return;
    try {
      g._todayStatsInFlight = null;
      win.webContents.send('today-stats-settle', { reason: 'settled-reconcile' });
    } catch (_) { /* window closing */ }
  }, wait);
  if (typeof timer.unref === 'function') timer.unref();
  return wait;
}

function cancelSettledReconcile() {
  if (timer) clearTimeout(timer);
  timer = null;
}

module.exports = {
  MIN_DELAY_MS,
  scheduleSettledReconcile,
  cancelSettledReconcile,
};
