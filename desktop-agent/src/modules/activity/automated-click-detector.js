'use strict';

/**
 * Spots clicks made by software (auto-clickers, click macros, hardware
 * clickers) so they do not count as activity and do not keep the user "not
 * idle".
 *
 * A click is treated as automated only when BOTH hold over its last
 * WINDOW_CLICKS clicks:
 *   1. machine-regular timing: the gaps between clicks vary by less than
 *      MAX_INTERVAL_CV, 7% (people clicking vary by 30–80%), and
 *   2. the mouse essentially did not move: at most MAX_MOVES_IN_WINDOW
 *      movement events across that whole stretch.
 *
 * Calibrated on 22 Oct 2026 logs from 22 employees: people never go more than
 * 2 minutes clicking without typing or moving the mouse; the two auto-clicker
 * cases ran 55–215 minutes at a steady 6–15 clicks/min with 3–6% variation.
 * Simulated: 50,000 runs of human-like clicking with zero mouse movement and
 * 20%+ variation were never flagged; fixed-interval clickers always were.
 *
 * Keystrokes get the same treatment (see recordKey): machine-regular typing,
 * or a key held down for over a minute. Mouse movement is always real input.
 * Windows' "injected" flag is only counted for diagnostics: password managers,
 * on-screen keyboards, remote support and some touchpad drivers set it on
 * genuine input.
 */

const WINDOW_CLICKS = 30;
const MAX_INTERVAL_CV = 0.07;
const MAX_MOVES_IN_WINDOW = 2;
const MIN_INTERVAL_MS = 300; // faster than this is a double-click, not a pattern
const MAX_INTERVAL_MS = 120_000; // a longer pause breaks the run
const ACTIVE_HOLD_MS = 60_000; // "automation active" lasts this long after the last automated click

// Keystrokes. A typing bot or key-repeater is machine-regular like a clicker;
// people typing vary by 40–80% between keys. A key held down (auto-repeat) is
// normal for a few seconds; held continuously for over a minute it is an
// object on the keyboard or a held-key tool (22 Oct: one user ~1,970 repeats a
// minute for 10.5 hours, every screenshot "300 keys, 0 clicks, 0 moves").
const WINDOW_KEYS = 40;
const KEY_MIN_INTERVAL_MS = 30;
const HELD_KEY_MAX_MS = 60_000;
const HELD_REPEAT_GAP_MS = 1_000; // repeats further apart than this end the hold
const SAME_KEY_REPEAT_GAP_MS = 150; // macOS: same key again this fast = auto-repeat

class AutomatedClickDetector {
  constructor(options = {}) {
    this.windowClicks = options.windowClicks || WINDOW_CLICKS;
    this.maxCv = options.maxIntervalCv ?? MAX_INTERVAL_CV;
    this.maxMoves = options.maxMovesInWindow ?? MAX_MOVES_IN_WINDOW;
    this.reset();
  }

  reset() {
    this._clicks = []; // timestamps of recent clicks
    this._keys = []; // timestamps of recent (non-repeat) keystrokes
    this._moves = []; // timestamps of recent mouse movement
    this._lastKeyAt = null;
    this._lastKeyId = null;
    this._holdStartedAt = null;
    this.lastRealInputAt = null;
    this.lastAutomatedAt = null;
    this.automatedClicks = 0;
    this.automatedKeys = 0;
    this.injectedEvents = 0;
    this._runStartedAt = null;
  }

  /** Mouse movement: real input. */
  recordMove(ts = Date.now()) {
    this._moves.push(ts);
    this._trimMoves(ts);
    this.lastRealInputAt = ts;
  }

  /**
   * A keystroke. Returns true when it is automated (caller must not count it):
   * - a key held down continuously for over HELD_KEY_MAX_MS, or
   * - machine-regular typing over WINDOW_KEYS keys with the mouse still.
   * `repeat` is Windows' auto-repeat mark; on macOS the same `keyId` again
   * within SAME_KEY_REPEAT_GAP_MS is treated as auto-repeat. The key identity
   * is only compared, never stored beyond the previous key.
   */
  recordKey(ts = Date.now(), { injected = false, repeat = false, keyId = null } = {}) {
    if (injected) this.injectedEvents += 1;
    const prevAt = this._lastKeyAt;
    let isRepeat = !!repeat;
    if (
      !isRepeat &&
      keyId != null &&
      keyId === this._lastKeyId &&
      prevAt != null &&
      ts - prevAt < SAME_KEY_REPEAT_GAP_MS
    ) {
      isRepeat = true;
    }
    this._lastKeyAt = ts;
    this._lastKeyId = keyId;

    let automated;
    if (isRepeat) {
      if (this._holdStartedAt == null || prevAt == null || ts - prevAt > HELD_REPEAT_GAP_MS) {
        this._holdStartedAt = prevAt ?? ts;
      }
      automated = ts - this._holdStartedAt > HELD_KEY_MAX_MS;
    } else {
      this._holdStartedAt = null;
      const last = this._keys[this._keys.length - 1];
      if (last != null && ts - last > MAX_INTERVAL_MS) this._keys = [];
      this._keys.push(ts);
      if (this._keys.length > WINDOW_KEYS) this._keys.shift();
      automated = this._looksAutomated(this._keys, WINDOW_KEYS, KEY_MIN_INTERVAL_MS);
    }
    this._mark(ts, automated);
    if (automated) this.automatedKeys += 1;
    return automated;
  }

  /**
   * A click. Returns true when it is automated (caller must not count it).
   * Non-automated clicks are real input.
   */
  recordClick(ts = Date.now(), { injected = false } = {}) {
    if (injected) this.injectedEvents += 1;
    const last = this._clicks[this._clicks.length - 1];
    if (last != null && ts - last > MAX_INTERVAL_MS) this._clicks = [];
    this._clicks.push(ts);
    if (this._clicks.length > this.windowClicks) this._clicks.shift();

    const automated = this._looksAutomated(this._clicks, this.windowClicks, MIN_INTERVAL_MS);
    this._mark(ts, automated);
    if (automated) this.automatedClicks += 1;
    return automated;
  }

  _mark(ts, automated) {
    if (automated) {
      if (this.lastAutomatedAt == null || ts - this.lastAutomatedAt > ACTIVE_HOLD_MS) {
        this._runStartedAt = ts;
      }
      this.lastAutomatedAt = ts;
    } else {
      this.lastRealInputAt = ts;
    }
  }

  /** True while an automated click run is going on (or ended < 1 min ago). */
  isActive(now = Date.now()) {
    return this.lastAutomatedAt != null && now - this.lastAutomatedAt <= ACTIVE_HOLD_MS;
  }

  /**
   * Idle seconds that ignore automated clicks: while automation is active,
   * the time since the last real input; otherwise null (use the OS figure).
   */
  realInputIdleSeconds(now = Date.now()) {
    if (!this.isActive(now)) return null;
    const since = this.lastRealInputAt ?? this._runStartedAt ?? now;
    return Math.max(0, Math.floor((now - since) / 1000));
  }

  _looksAutomated(stamps, size, minIntervalMs) {
    if (stamps.length < size) return false;
    const intervals = [];
    for (let i = 1; i < stamps.length; i++) {
      const gap = stamps[i] - stamps[i - 1];
      if (gap < minIntervalMs) return false;
      intervals.push(gap);
    }
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length;
    const cv = Math.sqrt(variance) / mean;
    if (!(cv < this.maxCv)) return false;
    const from = stamps[0];
    const to = stamps[stamps.length - 1];
    const moves = this._moves.filter((t) => t >= from && t <= to).length;
    return moves <= this.maxMoves;
  }

  _trimMoves(now) {
    const keepFrom = now - Math.max(this.windowClicks, WINDOW_KEYS) * MAX_INTERVAL_MS;
    while (this._moves.length && this._moves[0] < keepFrom) this._moves.shift();
    if (this._moves.length > 5000) this._moves.splice(0, this._moves.length - 5000);
  }

  stats() {
    return {
      automatedClicks: this.automatedClicks,
      automatedKeys: this.automatedKeys,
      injectedEvents: this.injectedEvents,
      active: this.isActive(),
      lastRealInputAt: this.lastRealInputAt,
    };
  }
}

module.exports = {
  AutomatedClickDetector,
  // Covers keystrokes too; same class under a clearer name.
  AutomatedInputDetector: AutomatedClickDetector,
  WINDOW_KEYS,
  HELD_KEY_MAX_MS,
  WINDOW_CLICKS,
  MAX_INTERVAL_CV,
  MAX_MOVES_IN_WINDOW,
};
