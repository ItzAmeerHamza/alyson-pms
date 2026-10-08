'use strict';

/**
 * Daily Activity bars must encode hours, not "had some activity".
 * Scale against a 12-hour workday so 9h and 7h stay visibly different.
 * If a day exceeds 12h, raise the axis to that day so nothing clips.
 */
const WORKDAY_SECONDS = 12 * 3600;
const DEFAULT_PLOT_PX = 120;

function monthlyDailyBarScaleSeconds(maxEffectiveSeconds) {
  const peak = Math.max(0, Math.floor(Number(maxEffectiveSeconds) || 0));
  return Math.max(WORKDAY_SECONDS, peak);
}

function monthlyDailyBarHeightPx(
  effectiveSeconds,
  maxEffectiveSeconds,
  plotPx = DEFAULT_PLOT_PX,
) {
  const value = Math.max(0, Math.floor(Number(effectiveSeconds) || 0));
  const plot = Math.max(40, Math.floor(Number(plotPx) || DEFAULT_PLOT_PX));
  if (value <= 0) return 2;
  const scale = monthlyDailyBarScaleSeconds(maxEffectiveSeconds);
  return Math.max(4, Math.round((value / scale) * plot));
}

module.exports = {
  WORKDAY_SECONDS,
  DEFAULT_PLOT_PX,
  monthlyDailyBarScaleSeconds,
  monthlyDailyBarHeightPx,
};
