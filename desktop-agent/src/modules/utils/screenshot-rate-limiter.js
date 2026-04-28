/**
 * Screenshot rate limiter utility
 * Enforces: max N screenshots in a rolling window and a minimum gap between shots
 * Pure time math; no I/O or Electron calls.
 */

class ScreenshotRateLimiter {
  constructor(options = {}) {
    this.maxInWindow = options.maxInWindow || 3;
    this.windowMs = options.windowMs || (10 * 60 * 1000);
    this.minGapMs = options.minGapMs || (3 * 60 * 1000);
    this.recent = []; // ascending timestamps (ms), bounded to maxInWindow
  }

  prune(nowMs) {
    const cutoff = nowMs - this.windowMs;
    while (this.recent.length > 0 && this.recent[0] <= cutoff) {
      this.recent.shift();
    }
  }

  canTake(nowMs) {
    this.prune(nowMs);
    const last = this.recent.length > 0 ? this.recent[this.recent.length - 1] : 0;
    if (last && (nowMs - last) < this.minGapMs) {
      return { allowed: false, reason: 'min-gap', nextAllowedInMs: this.minGapMs - (nowMs - last) };
    }
    if (this.recent.length >= this.maxInWindow) {
      const oldest = this.recent[0];
      const nextIn = (oldest + this.windowMs) - nowMs;
      return { allowed: false, reason: 'window-limit', nextAllowedInMs: Math.max(0, nextIn) };
    }
    return { allowed: true };
  }

  record(nowMs) {
    this.prune(nowMs);
    this.recent.push(nowMs);
    while (this.recent.length > this.maxInWindow) {
      this.recent.shift();
    }
  }
}

module.exports = ScreenshotRateLimiter;


