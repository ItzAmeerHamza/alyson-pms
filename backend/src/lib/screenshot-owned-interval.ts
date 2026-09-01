/**
 * Time a screenshot "owns" on the timeline: midpoint(prev, this) → midpoint(this, next).
 * Neighbors are the real capture times, so a random N-in-M schedule does not
 * invent a flat interval. `capMs` is only a ceiling (derived average gap).
 */
export function screenshotOwnedRangeMs(
  prevMs: number | null,
  targetMs: number,
  nextMs: number | null,
  capMs: number,
): { startMs: number; endMs: number } {
  const cap = Math.max(10_000, Math.floor(Number(capMs) || 60_000));
  const half = cap / 2;
  const target = Number(targetMs);
  if (!Number.isFinite(target)) return { startMs: 0, endMs: 0 };

  const prev = Number.isFinite(prevMs as number) ? (prevMs as number) : null;
  const next = Number.isFinite(nextMs as number) ? (nextMs as number) : null;

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

export function screenshotOwnedSeconds(
  prevMs: number | null,
  targetMs: number,
  nextMs: number | null,
  capMs: number,
): number {
  const { startMs, endMs } = screenshotOwnedRangeMs(prevMs, targetMs, nextMs, capMs);
  return Math.max(0, Math.round((endMs - startMs) / 1000));
}

export function lowActivityCapMs(intervalMinutes: number): number {
  const minutes = Math.max(1, Number(intervalMinutes) || 1);
  return minutes * 60 * 1000;
}
