/**
 * Monotonic Clock Helper
 * Provides a steady, monotonic time source for duration calculations
 */

const { performance } = require('perf_hooks');

function monotonicNow() {
  return performance.now(); // milliseconds, monotonically increasing
}

module.exports = { monotonicNow };


