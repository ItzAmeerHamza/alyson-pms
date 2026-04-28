/**
 * Shared time calculation utilities for the desktop agent.
 * Single source of truth for duration computation -- no more
 * ad-hoc Date math scattered across managers.
 */

/**
 * Calculate session duration in seconds.
 * Returns raw duration with no cap — real work time is always shown.
 */
function sessionDurationSeconds(startTime, endTime) {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  const diffMs = end - start;
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / 1000);
}

/**
 * Calculate session duration in hours.
 */
function sessionDurationHours(startTime, endTime) {
  return sessionDurationSeconds(startTime, endTime) / 3600;
}

/**
 * Format seconds as "Xh Ym".
 */
function formatDuration(totalSeconds) {
  if (!totalSeconds || totalSeconds < 60) return '< 1m';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

module.exports = {
  sessionDurationSeconds,
  sessionDurationHours,
  formatDuration,
};
