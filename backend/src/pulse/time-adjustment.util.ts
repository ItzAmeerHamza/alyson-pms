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
