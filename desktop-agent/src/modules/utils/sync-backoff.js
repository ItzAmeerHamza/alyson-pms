/**
 * Shared retry timing for desktop sync.
 * Lockstep 15s/30s/60s retries are what turn one RDS "too many connections"
 * blip into a company-wide storm.
 */

const DEFAULT_BASE_MS = 15 * 1000;
const DEFAULT_MAX_MS = 5 * 60 * 1000;
const RECONNECT_SPREAD_MS = 20 * 1000;

function jitteredBackoffMs(
  retryCount,
  { baseMs = DEFAULT_BASE_MS, maxMs = DEFAULT_MAX_MS, random = Math.random } = {},
) {
  const n = Math.max(1, Math.floor(Number(retryCount) || 1));
  const exp = Math.min(maxMs, baseMs * Math.pow(2, n - 1));
  const jitter = Math.floor(Number(random()) * Math.min(exp * 0.4, 15 * 1000));
  return Math.min(maxMs, exp + jitter);
}

function reconnectSpreadMs({ random = Math.random, maxMs = RECONNECT_SPREAD_MS } = {}) {
  return Math.floor(Number(random()) * Math.max(0, maxMs));
}

function isTransientDbOrNetworkError(msg) {
  return /timeout|fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT|ECONNREFUSED|offline|too many connections|remaining connection slots|53300|57P03|08006|08001|connection terminated|database system is|temporarily unavailable|internal server error|502|503|504|429/i.test(
    String(msg || ''),
  );
}

module.exports = {
  DEFAULT_BASE_MS,
  DEFAULT_MAX_MS,
  jitteredBackoffMs,
  reconnectSpreadMs,
  isTransientDbOrNetworkError,
};
