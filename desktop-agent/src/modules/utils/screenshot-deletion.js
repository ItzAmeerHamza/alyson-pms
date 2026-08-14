const { createFeatureLogger } = require('./logger');

const log = createFeatureLogger('SCREEN', { adapter: 'deletion' });

const MAX_DEDUCTION_SECONDS = 240; // 4 minutes cap per screenshot

/**
 * Calculate time deduction for a screenshot using the midpoint algorithm.
 * Each screenshot "owns" the interval from midpoint(prev, this) to midpoint(this, next).
 */
function calculateDeductionSeconds({ targetCapturedAt, prevCapturedAt, nextCapturedAt, sessionStart, sessionEnd }) {
  const target = new Date(targetCapturedAt).getTime();
  const start = new Date(sessionStart).getTime();
  const end = sessionEnd ? new Date(sessionEnd).getTime() : Date.now();

  let intervalStart = prevCapturedAt
    ? (new Date(prevCapturedAt).getTime() + target) / 2
    : start;

  let intervalEnd = nextCapturedAt
    ? (target + new Date(nextCapturedAt).getTime()) / 2
    : end;

  // Clamp to session bounds: screenshots may exist outside the time log window
  intervalStart = Math.max(intervalStart, start);
  intervalEnd = Math.min(intervalEnd, Math.max(end, target + 60000));

  // If target is outside the session window entirely, use a sensible default
  if (intervalEnd <= intervalStart) {
    return Math.min(200, MAX_DEDUCTION_SECONDS);
  }

  const rawSeconds = Math.max(0, Math.round((intervalEnd - intervalStart) / 1000));
  return Math.min(rawSeconds, MAX_DEDUCTION_SECONDS);
}

const UNSUPPORTED_MESSAGE =
  'Client-side screenshot deletion is unavailable — the backend owns RDS rows and the S3 object';

/**
 * Estimating a deduction requires reading neighbouring screenshots and the parent
 * time log, which the desktop agent cannot do against RDS. Use
 * estimateDeductionViaBackend() in backend-screenshots.js instead.
 */
async function estimateDeduction() {
  log.warn({ step: 'ESTIMATE_UNSUPPORTED', message: UNSUPPORTED_MESSAGE });
  throw new Error(`${UNSUPPORTED_MESSAGE} (use estimateDeductionViaBackend)`);
}

/**
 * Deleting a screenshot writes the audit row, deducts time and removes the S3
 * object — all server-side concerns. Use deleteScreenshotViaBackend() in
 * backend-screenshots.js instead. Returns a failure rather than pretending the
 * screenshot was deleted.
 */
async function deleteScreenshotWithDeduction() {
  log.warn({ step: 'DELETE_UNSUPPORTED', message: UNSUPPORTED_MESSAGE });
  return { success: false, error: `${UNSUPPORTED_MESSAGE} (use deleteScreenshotViaBackend)` };
}

module.exports = {
  calculateDeductionSeconds,
  estimateDeduction,
  deleteScreenshotWithDeduction,
  MAX_DEDUCTION_SECONDS
};
