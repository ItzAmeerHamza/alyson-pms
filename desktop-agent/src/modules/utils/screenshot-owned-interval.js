/**
 * Time a screenshot owns on the timeline: midpoint(prev, this) → midpoint(this, next).
 * `capMs` is a ceiling (derived average gap), not the credit.
 */
function screenshotOwnedRangeMs(prevMs, targetMs, nextMs, capMs) {
  const cap = Math.max(10_000, Math.floor(Number(capMs) || 60_000));
  const half = cap / 2;
  const target = Number(targetMs);
  if (!Number.isFinite(target)) return { startMs: 0, endMs: 0 };

  const prev = Number.isFinite(prevMs) ? prevMs : null;
  const next = Number.isFinite(nextMs) ? nextMs : null;

  let startMs = prev != null ? (prev + target) / 2 : target - half;
  let endMs = next != null ? (target + next) / 2 : target + half;
  if (endMs - startMs > cap) {
    startMs = Math.max(startMs, target - half);
    endMs = Math.min(endMs, target + half);
    if (endMs - startMs > cap) endMs = startMs + cap;
  }
  if (endMs <= startMs) return { startMs: target, endMs: target };
  return { startMs, endMs };
}

function screenshotOwnedSeconds(prevMs, targetMs, nextMs, capMs) {
  const { startMs, endMs } = screenshotOwnedRangeMs(prevMs, targetMs, nextMs, capMs);
  return Math.max(0, Math.round((endMs - startMs) / 1000));
}

function overlapSeconds(owned, cut) {
  const lo = Math.max(owned.startMs, cut.startMs);
  const hi = Math.min(owned.endMs, cut.endMs);
  return hi > lo ? (hi - lo) / 1000 : 0;
}

module.exports = {
  screenshotOwnedRangeMs,
  screenshotOwnedSeconds,
  overlapSeconds,
};
