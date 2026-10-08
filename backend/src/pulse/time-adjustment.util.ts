/** Resolve signed delta seconds from DTO fields. */
export function resolveAdjustmentDeltaSeconds(input: {
  deltaSeconds?: number;
  hours?: number;
  deltaMinutes?: number;
}): number {
  if (input.deltaSeconds != null && Number.isFinite(Number(input.deltaSeconds))) {
    return Math.trunc(Number(input.deltaSeconds));
  }
  if (input.hours != null && Number.isFinite(Number(input.hours))) {
    return Math.round(Number(input.hours) * 3600);
  }
  if (input.deltaMinutes != null && Number.isFinite(Number(input.deltaMinutes))) {
    return Math.trunc(Number(input.deltaMinutes)) * 60;
  }
  return 0;
}

/** Holiday/leave credit that still applies after tracked time (never stacks on top). */
export function leaveTopUpHours(trackedHours: number, leaveCreditHours: number): number {
  const tracked = Number(trackedHours) || 0;
  const leave = Number(leaveCreditHours) || 0;
  return Math.max(0, Math.round((leave - tracked) * 10) / 10);
}

/**
 * Holiday is a floor, not a stack: work 2h + 7h holiday → 7h; work 9h + 7h holiday → 9h.
 */
export function dayHoursWithLeaveTopUp(input: {
  trackedHours: number;
  otherAdjustmentHours?: number;
  leaveCreditHours?: number;
}): number {
  const tracked = Number(input.trackedHours) || 0;
  const other = Number(input.otherAdjustmentHours) || 0;
  const leaveApplied = leaveTopUpHours(tracked, Number(input.leaveCreditHours) || 0);
  return Math.max(0, Math.round((tracked + other + leaveApplied) * 10) / 10);
}

/**
 * Day total after applying a new adjustment.
 * Returns null when the result would be negative.
 */
export function nextDayTotalHours(
  trackedHours: number,
  currentNetAdjustmentSeconds: number,
  deltaSeconds: number,
): number | null {
  const next =
    Number(trackedHours) +
    (Number(currentNetAdjustmentSeconds) + Number(deltaSeconds)) / 3600;
  if (next < -0.0001) return null;
  return Math.max(0, Math.round(next * 10) / 10);
}
