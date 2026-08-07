/**
 * Effective / non-effective hours from tracked + idle + low activity.
 *
 * non_effective = min(total, low_activity + idle)
 * effective     = total - non_effective
 */
export function computeEffectiveTime(
  totalHours: number,
  lowActivityHours: number,
  idleHours: number,
): {
  total_hours: number;
  non_effective_hours: number;
  effective_hours: number;
} {
  const total = Math.max(0, Number(totalHours) || 0);
  const low = Math.max(0, Number(lowActivityHours) || 0);
  const idle = Math.max(0, Number(idleHours) || 0);
  const nonEffective = Math.min(total, low + idle);
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    total_hours: round1(total),
    non_effective_hours: round1(nonEffective),
    effective_hours: round1(Math.max(0, total - nonEffective)),
  };
}
