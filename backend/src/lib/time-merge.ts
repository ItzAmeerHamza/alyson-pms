/**
 * Interval merging utilities for multi-device session support.
 * Prevents double-counting when a user runs the agent on multiple devices.
 */

export interface TimeInterval {
  startMs: number;
  endMs: number;
}

/** Open sessions end at last proof-of-life, never wall-clock now. */
export function sessionEndMs(log: {
  end_time?: string | Date | null;
  last_alive_at?: string | Date | null;
}): number {
  const raw = log.end_time ?? log.last_alive_at ?? Date.now();
  return new Date(raw).getTime();
}

/**
 * Authorized idle-prompt cut (shown alert, 1 min unanswered).
 * Bill the client's now−10m. Do NOT raise to last_alive_at — the machine
 * was still alive; the cut is the product rule, not a crash.
 */
export function authorizedIdleCutEndMs(params: {
  startMs: number;
  clientEndMs: number;
  nowMs: number;
}): number {
  if (!Number.isFinite(params.startMs) || !Number.isFinite(params.clientEndMs)) {
    return params.startMs;
  }
  const nowMs = Number.isFinite(params.nowMs) ? params.nowMs : Date.now();
  return Math.max(params.startMs, Math.min(params.clientEndMs, nowMs));
}

/** Screenshot-delete / authorized deductions, never below zero. */
export function deductedHours(deductedSeconds: number | null | undefined): number {
  return Math.max(0, (Number(deductedSeconds) || 0) / 3600);
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
    last_alive_at?: string | Date | null;
    idle_seconds?: number | null;
    deducted_seconds?: number | null;
  }>,
): Map<string, number> {
  const byUser = new Map<string, Array<{ interval: TimeInterval }>>();

  for (const log of logs) {
    const startMs = new Date(log.start_time).getTime();
    const endMs = sessionEndMs(log);
    if (endMs <= startMs) continue;

    if (!byUser.has(log.user_id)) byUser.set(log.user_id, []);
    byUser.get(log.user_id)!.push({
      interval: { startMs, endMs },
    });
  }

  const deductedByUser = new Map<string, number>();
  for (const log of logs) {
    const hours = deductedHours(log.deducted_seconds);
    if (hours <= 0) continue;
    deductedByUser.set(log.user_id, (deductedByUser.get(log.user_id) ?? 0) + hours);
  }

  const result = new Map<string, number>();
  for (const [userId, entries] of byUser) {
    const merged = mergeTimeIntervals(entries.map((e) => e.interval));
    let totalMs = 0;
    for (const interval of merged) {
      totalMs += interval.endMs - interval.startMs;
    }
    const hours = totalMs / (1000 * 60 * 60) - (deductedByUser.get(userId) ?? 0);
    result.set(userId, Math.max(0, Math.round(hours * 10) / 10));
  }

  return result;
}
