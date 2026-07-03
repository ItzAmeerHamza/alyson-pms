/**
 * Interval merging utilities for multi-device session support.
 * Prevents double-counting when a user runs the agent on multiple devices.
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

/**
 * Calculate merged total hours from time logs grouped by user.
 * Returns a Map of userId -> effective hours.
 */
export function calculateMergedHoursByUser(
  logs: Array<{
    user_id: string;
    start_time: string | Date;
    end_time: string | Date | null;
    idle_seconds?: number | null;
  }>,
): Map<string, number> {
  const byUser = new Map<string, Array<{ interval: TimeInterval }>>();

  for (const log of logs) {
    const startMs = new Date(log.start_time).getTime();
    const endMs = log.end_time
      ? new Date(log.end_time).getTime()
      : Date.now();
    if (endMs <= startMs) continue;

    if (!byUser.has(log.user_id)) byUser.set(log.user_id, []);
    byUser.get(log.user_id)!.push({
      interval: { startMs, endMs },
    });
  }

  const result = new Map<string, number>();
  for (const [userId, entries] of byUser) {
    const merged = mergeTimeIntervals(entries.map((e) => e.interval));
    let totalMs = 0;
    for (const interval of merged) {
      totalMs += interval.endMs - interval.startMs;
    }
    const hours = totalMs / (1000 * 60 * 60);
    result.set(userId, Math.round(hours * 10) / 10);
  }

  return result;
}
