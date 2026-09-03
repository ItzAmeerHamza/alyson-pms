/**
 * Stamp Pulse idle / low-activity onto each work day. Month cards then
 * accumulate min(tracked, idle + low) per day — the same split Today uses.
 *
 * Only dates present in pulseDaily are stamped. A missing/empty Pulse payload
 * must not wipe a split we already have (network miss ≠ zero idle).
 */
function applyPulseEffectiveByDay(dailyBreakdown, pulseDaily) {
  const byDate = pulseDaily && typeof pulseDaily === 'object' ? pulseDaily : {};
  if (!Object.keys(byDate).length) return dailyBreakdown;
  for (const day of dailyBreakdown || []) {
    const row = byDate[day.date];
    if (!row || typeof row !== 'object') continue;
    day.idleSeconds = Math.max(0, Math.floor(Number(row.idleSeconds) || 0));
    day.lowSeconds = Math.max(0, Math.floor(Number(row.lowActivitySeconds) || 0));
  }
  return dailyBreakdown;
}

/**
 * Overlay Today's Pulse split onto the month row. A failed/offline compute
 * returns zeros with computed:false — applying those would erase the month
 * Pulse stamp and report the whole day as effective.
 */
function applyTodayEffectiveIfMeasured(day, todayEff) {
  if (!day || todayEff?.computed !== true) return day;
  day.idleSeconds = Math.max(0, Math.floor(Number(todayEff.idleSeconds) || 0));
  day.lowSeconds = Math.max(0, Math.floor(Number(todayEff.lowActivitySeconds) || 0));
  if (todayEff.nonEffectiveSeconds != null) {
    day.nonEffectiveSeconds = Math.max(0, Math.floor(Number(todayEff.nonEffectiveSeconds) || 0));
  }
  if (todayEff.effectiveSeconds != null) {
    day.effectiveSeconds = Math.max(0, Math.floor(Number(todayEff.effectiveSeconds) || 0));
  }
  return day;
}

module.exports = { applyPulseEffectiveByDay, applyTodayEffectiveIfMeasured };
