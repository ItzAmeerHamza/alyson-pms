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

/**
 * Full leave credit to add. Tracked time is kept and does not reduce this.
 * Public holidays are removed before this runs; they are not a credit.
 */
export function leaveTopUpHours(_trackedHours: number, leaveCreditHours: number): number {
  const leave = Number(leaveCreditHours) || 0;
  return Math.round(Math.max(0, leave) * 10) / 10;
}

/**
 * Day total = tracked + full leave credit + other adjustments.
 * Work 1h on a 7h leave day → 8h. A manual add sits on top of that.
 */
export function dayHoursWithLeaveTopUp(input: {
  trackedHours: number;
  otherAdjustmentHours?: number;
  leaveCreditHours?: number;
}): number {
  const tracked = Number(input.trackedHours) || 0;
  const other = Number(input.otherAdjustmentHours) || 0;
  const leave = leaveTopUpHours(tracked, Number(input.leaveCreditHours) || 0);
  return Math.max(0, Math.round((tracked + other + leave) * 10) / 10);
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
