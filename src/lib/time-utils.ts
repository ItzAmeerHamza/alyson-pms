const SMART_GAP_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const SCREENSHOT_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Calculate duration in hours between two timestamps.
 * If endTime is null (ongoing session), uses current time.
 */
export function calculateSessionHours(
  startTime: string | Date,
  endTime: string | Date | null
): number {
  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : new Date();
  const diffMs = end.getTime() - start.getTime();

  if (diffMs <= 0) return 0;

  return diffMs / (1000 * 60 * 60);
}

/**
 * Calculate duration in seconds between two timestamps.
 * If endTime is null (ongoing session), uses current time.
 */
export function calculateSessionSeconds(
  startTime: string | Date,
  endTime: string | Date | null
): number {
  return Math.round(calculateSessionHours(startTime, endTime) * 3600);
}

/**
 * Format seconds into human-readable duration string.
 * Examples: "2h 15m", "45m", "< 1m"
 */
export function formatDurationFromSeconds(totalSeconds: number): string {
  if (totalSeconds < 60) return '< 1m';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Format hours into human-readable duration string.
 */
export function formatDurationFromHours(hours: number): string {
  return formatDurationFromSeconds(hours * 3600);
}

/**
 * Calculate effective hours for a session.
 * Uses raw duration (end - start), no cap.
 * Only deducted_seconds (from screenshot deletions) are subtracted.
 * Idle time is tracked as INFO only and NOT subtracted.
 */
export function calculateEffectiveHours(
  startTime: string | Date,
  endTime: string | Date | null,
  _idleSeconds: number = 0,
  deductedSeconds: number = 0
): number {
  const rawHours = calculateSessionHours(startTime, endTime);
  const deductedHours = deductedSeconds / 3600;
  return Math.max(0, rawHours - deductedHours);
}

/**
 * Get app/URL log duration from database fields.
 * Prefers duration_seconds (trigger-computed), falls back to started_at/ended_at calc.
 * Never falls back to hardcoded 60s.
 */
export function getLogDuration(log: {
  duration_seconds?: number | null;
  started_at?: string | null;
  ended_at?: string | null;
}): number {
  if (log.duration_seconds && log.duration_seconds > 0) {
    return log.duration_seconds;
  }
  if (log.started_at && log.ended_at) {
    const start = new Date(log.started_at);
    const end = new Date(log.ended_at);
    const seconds = (end.getTime() - start.getTime()) / 1000;
    return Math.max(0, seconds);
  }
  return 0;
}

/**
 * Calculate SMART session duration in seconds, capping sessions where the last screenshot
 * is far before the session end_time (e.g. session stayed open overnight).
 *
 * If lastScreenshotTime exists and (endTime - lastScreenshotTime) > 30 minutes:
 *   return (lastScreenshotTime + 5min - startTime)
 * Otherwise: return normal (endTime - startTime)
 */
export function calculateSmartSessionSeconds(
  startTime: string | Date,
  endTime: string | Date | null,
  lastScreenshotTime?: string | Date | null
): number {
  const startMs = new Date(startTime).getTime();
  const endMs = endTime ? new Date(endTime).getTime() : Date.now();

  if (endMs <= startMs) return 0;

  // If last screenshot exists and gap is > 30 minutes, use screenshot-based end
  if (lastScreenshotTime) {
    const lastSsMs = new Date(lastScreenshotTime).getTime();
    if (lastSsMs >= startMs && (endMs - lastSsMs) > SMART_GAP_THRESHOLD_MS) {
      const smartEndMs = lastSsMs + SCREENSHOT_BUFFER_MS;
      const smartDurationMs = smartEndMs - startMs;
      return Math.max(0, Math.round(smartDurationMs / 1000));
    }
  }

  // Normal calculation — raw duration
  const durationMs = endMs - startMs;
  return Math.max(0, Math.round(durationMs / 1000));
}

/**
 * Compute smart end time (in ms) for a session interval, capping with last screenshot.
 * Used by interval-merging calculations across report pages.
 */
export function getSmartEndMs(
  startMs: number,
  endMs: number,
  lastScreenshotMs?: number
): number {
  if (lastScreenshotMs && lastScreenshotMs >= startMs) {
    const gapMs = endMs - lastScreenshotMs;
    if (gapMs > SMART_GAP_THRESHOLD_MS) {
      return Math.max(startMs, lastScreenshotMs + SCREENSHOT_BUFFER_MS);
    }
  }
  return Math.max(startMs, endMs);
}

// --- Multi-device time merging ---

export interface TimeInterval {
  startMs: number;
  endMs: number;
}

export interface TimeLogForMerge {
  start_time: string;
  end_time: string | null;
  idle_seconds?: number | null;
  deducted_seconds?: number | null;
  user_id: string;
}

/**
 * Merge overlapping time intervals into non-overlapping ranges.
 * Input must be sorted by startMs. Returns merged, non-overlapping intervals.
 */
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
 * Calculate total hours for a user from multiple (possibly overlapping) time logs.
 * Merges overlapping intervals so multi-device sessions are not double-counted.
 *
 * Only deducted_seconds (from screenshot deletions) are subtracted.
 * Idle time is tracked as INFO only and NOT subtracted from hours.
 */
export function calculateMergedEffectiveHours(
  logs: TimeLogForMerge[],
  screenshotsBySession?: Map<string, number>
): number {
  if (logs.length === 0) return 0;

  const now = Date.now();
  const intervals: TimeInterval[] = [];
  let totalDeductedSeconds = 0;

  for (const log of logs) {
    const startMs = new Date(log.start_time).getTime();
    let endMs: number;

    if (log.end_time) {
      endMs = new Date(log.end_time).getTime();
    } else {
      endMs = now;
    }

    if (endMs <= startMs) continue;

    // Apply smart session capping with screenshot data
    const lastSsMs = screenshotsBySession?.get((log as any).id);
    endMs = getSmartEndMs(startMs, endMs, lastSsMs);

    intervals.push({ startMs, endMs });
    totalDeductedSeconds += (log as any).deducted_seconds || 0;
  }

  const merged = mergeTimeIntervals(intervals);

  let totalMs = 0;
  for (const interval of merged) {
    totalMs += interval.endMs - interval.startMs;
  }

  const rawHours = totalMs / (1000 * 60 * 60);
  const deductedHours = totalDeductedSeconds / 3600;
  return Math.max(0, rawHours - deductedHours);
}

/**
 * Group time logs by user_id and calculate merged effective hours per user.
 * Returns a map of user_id -> effective hours.
 */
export function calculateMergedHoursByUser(logs: TimeLogForMerge[]): Map<string, number> {
  const byUser = new Map<string, TimeLogForMerge[]>();

  for (const log of logs) {
    const userId = log.user_id;
    if (!byUser.has(userId)) byUser.set(userId, []);
    byUser.get(userId)!.push(log);
  }

  const result = new Map<string, number>();
  for (const [userId, userLogs] of byUser) {
    result.set(userId, calculateMergedEffectiveHours(userLogs));
  }

  return result;
}

/**
 * Calculate total merged seconds from intervals within a date range.
 * Used by live monitoring to compute worked seconds with overlap protection.
 */
export function calculateMergedWorkedSeconds(
  timeLogs: Array<{ start_time?: string; started_at?: string; end_time?: string; ended_at?: string; id?: string }>,
  fromISO: string
): number {
  const from = new Date(fromISO).getTime();
  const now = Date.now();

  const intervals: TimeInterval[] = [];

  const sorted = [...timeLogs].sort((a, b) => {
    const aStart = new Date(a.start_time || a.started_at || '').getTime();
    const bStart = new Date(b.start_time || b.started_at || '').getTime();
    return bStart - aStart;
  });
  const mostRecentId = sorted[0]?.id;

  for (const t of timeLogs) {
    const start = new Date(t.start_time || t.started_at || '').getTime();
    const hasEndTime = !!(t.end_time || t.ended_at);

    let end: number;
    if (hasEndTime) {
      end = new Date(t.end_time || t.ended_at || '').getTime();
    } else if (t.id === mostRecentId) {
      end = now;
    } else {
      continue;
    }

    const overlapStart = Math.max(start, from);
    const overlapEnd = Math.max(overlapStart, end);

    if (overlapEnd > overlapStart) {
      intervals.push({ startMs: overlapStart, endMs: overlapEnd });
    }
  }

  const merged = mergeTimeIntervals(intervals);

  let total = 0;
  for (const interval of merged) {
    const seconds = Math.floor((interval.endMs - interval.startMs) / 1000);
    total += seconds;
  }
  return total;
}
