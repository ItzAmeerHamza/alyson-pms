/**
 * Interval merging for multi-device session support.
 * Shared across edge functions.
 */

export interface TimeInterval {
  startMs: number;
  endMs: number;
}

export function mergeTimeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  if (intervals.length === 0) return [];

  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs);
  const merged: TimeInterval[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, current.endMs);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

export function mergedTotalHours(
  logs: Array<{ start_time: string; end_time: string | null; idle_seconds?: number }>,
): number {
  const intervals: TimeInterval[] = [];
  const now = Date.now();

  for (const log of logs) {
    if (!log.start_time) continue;
    const startMs = new Date(log.start_time).getTime();
    let endMs: number;
    if (log.end_time) {
      endMs = new Date(log.end_time).getTime();
    } else {
      endMs = now;
    }
    if (endMs <= startMs) continue;
    intervals.push({ startMs, endMs });
  }

  const merged = mergeTimeIntervals(intervals);
  let totalMs = 0;
  for (const interval of merged) {
    totalMs += interval.endMs - interval.startMs;
  }

  return totalMs / (1000 * 60 * 60);
}
