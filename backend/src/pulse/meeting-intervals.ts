/**
 * Turn meeting screenshots into time ranges, then subtract those ranges from idle.
 *
 * A 1-hour Google Meet with no typing is still work. Pulse used to add that hour
 * as idle (and sometimes as low-activity when she flipped to Signal/docs). These
 * helpers keep meeting minutes out of both non-effective buckets.
 */

export type TimeInterval = { startMs: number; endMs: number };

/**
 * Join meeting-titled shots a few minutes apart (tab flicker).
 * Word/docs during a call are protected by the 50% activity saved at capture,
 * not by stretching this join across hours.
 */
export const MEETING_INTERVAL_JOIN_MS = 10 * 60 * 1000;

export function mergeCapturedAtsIntoIntervals(
  capturedAtMs: number[],
  coverageMs: number,
  joinGapMs: number = MEETING_INTERVAL_JOIN_MS,
): TimeInterval[] {
  const cover = Math.max(10_000, Math.floor(Number(coverageMs) || 60_000));
  const join = Math.max(0, Math.floor(Number(joinGapMs) || 0));
  const times = capturedAtMs.filter((ms) => Number.isFinite(ms)).sort((a, b) => a - b);
  if (!times.length) return [];

  const out: TimeInterval[] = [];
  let start = times[0];
  let end = times[0] + cover;
  for (let i = 1; i < times.length; i += 1) {
    const nextStart = times[i];
    const nextEnd = times[i] + cover;
    if (nextStart <= end + join) {
      end = Math.max(end, nextEnd);
    } else {
      out.push({ startMs: start, endMs: end });
      start = nextStart;
      end = nextEnd;
    }
  }
  out.push({ startMs: start, endMs: end });
  // Join is used between shots, not after the last one. Without this pad, a
  // meeting only "covers" `coverageMs` past the latest Meet screenshot. Pulse
  // then starts counting idle/low again, the next Meet shot arrives, the gap
  // is joined, and non-effective drops — 20m ↔ 6m on every poll.
  return out.map((iv) => ({ startMs: iv.startMs, endMs: iv.endMs + join }));
}

export function intervalOverlapMs(a: TimeInterval, b: TimeInterval): number {
  const lo = Math.max(a.startMs, b.startMs);
  const hi = Math.min(a.endMs, b.endMs);
  return hi > lo ? hi - lo : 0;
}

export function intervalContains(ms: number, intervals: TimeInterval[]): boolean {
  return intervals.some((iv) => ms >= iv.startMs && ms < iv.endMs);
}

/** Remaining idle after removing meeting overlap. */
export function subtractIntervals(source: TimeInterval, cuts: TimeInterval[]): TimeInterval[] {
  let pieces = [source];
  for (const cut of cuts) {
    const next: TimeInterval[] = [];
    for (const piece of pieces) {
      const overlap = intervalOverlapMs(piece, cut);
      if (overlap <= 0) {
        next.push(piece);
        continue;
      }
      if (piece.startMs < cut.startMs) {
        next.push({ startMs: piece.startMs, endMs: Math.min(piece.endMs, cut.startMs) });
      }
      if (piece.endMs > cut.endMs) {
        next.push({ startMs: Math.max(piece.startMs, cut.endMs), endMs: piece.endMs });
      }
    }
    pieces = next.filter((p) => p.endMs > p.startMs);
  }
  return pieces;
}
