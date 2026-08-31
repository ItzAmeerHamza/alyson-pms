const { randomInt } = require('crypto');

/** Defaults when workspace settings are missing: 2 shots / 10 minutes → 12/hour. */
const DEFAULT_WINDOW_MINUTES = 10;
const DEFAULT_SHOTS_PER_WINDOW = 2;
const WINDOW_MS = DEFAULT_WINDOW_MINUTES * 60 * 1000;
const SHOTS_PER_WINDOW = DEFAULT_SHOTS_PER_WINDOW;
/** Keep shots from stacking; do not pad the start of the window (that is guessable). */
const MIN_GAP_MS = 90 * 1000;
const MIN_WINDOW_MINUTES = 5;
const MAX_WINDOW_MINUTES = 120;
const MIN_SHOTS_PER_WINDOW = 1;
const MAX_SHOTS_PER_WINDOW = 8;

function clampInt(raw, fallback, min, max) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeRandomScreenshotSchedule(raw = {}) {
  const windowMinutes = clampInt(
    raw.screenshot_window_minutes ?? raw.windowMinutes,
    DEFAULT_WINDOW_MINUTES,
    MIN_WINDOW_MINUTES,
    MAX_WINDOW_MINUTES,
  );
  const count = clampInt(
    raw.screenshot_count_per_window ?? raw.shots ?? raw.count,
    DEFAULT_SHOTS_PER_WINDOW,
    MIN_SHOTS_PER_WINDOW,
    MAX_SHOTS_PER_WINDOW,
  );
  return {
    windowMinutes,
    count,
    windowMs: windowMinutes * 60 * 1000,
    intervalMinutes: Math.max(1, Math.round(windowMinutes / count)),
  };
}

function cryptoOffset(windowMs) {
  const w = Math.max(1, Math.floor(windowMs));
  return randomInt(0, w);
}

/**
 * Two uniformly random offsets in [0, windowMs), at least minGapMs apart.
 * Uses crypto.randomInt so the sequence is not Math.random()-guessable.
 */
function pickTwoOffsets(windowMs, minGapMs) {
  const w = Math.max(1, Math.floor(windowMs));
  const gap = Math.min(Math.max(0, Math.floor(minGapMs)), w - 1);

  for (let i = 0; i < 48; i++) {
    const a = cryptoOffset(w);
    const b = cryptoOffset(w);
    if (Math.abs(a - b) >= gap) {
      return a < b ? [a, b] : [b, a];
    }
  }

  const first = cryptoOffset(w);
  const leftHi = first - gap + 1;
  const rightStart = first + gap;
  const leftSpan = Math.max(0, leftHi);
  const rightSpan = Math.max(0, w - rightStart);
  if (leftSpan <= 0 && rightSpan <= 0) {
    return [0, Math.min(w - 1, gap)];
  }
  if (rightSpan <= 0 || (leftSpan > 0 && randomInt(0, leftSpan + rightSpan) < leftSpan)) {
    const second = randomInt(0, leftHi);
    return second < first ? [second, first] : [first, second];
  }
  const second = randomInt(rightStart, w);
  return first < second ? [first, second] : [second, first];
}

function generateRandomScreenshotOffsets(
  windowMs = WINDOW_MS,
  shots = SHOTS_PER_WINDOW,
  minGapMs = MIN_GAP_MS,
) {
  const n = Math.max(1, Math.floor(Number(shots) || 1));
  const w = Math.max(1, Math.floor(windowMs));
  const gap = Math.max(0, Math.floor(minGapMs));

  if (n === 1) return [cryptoOffset(w)];
  if (n === 2) return pickTwoOffsets(w, gap);

  const offsets = [];
  let guard = 0;
  while (offsets.length < n && guard < n * 80) {
    guard += 1;
    const candidate = cryptoOffset(w);
    if (offsets.every((existing) => Math.abs(existing - candidate) >= gap)) {
      offsets.push(candidate);
    }
  }
  if (offsets.length < n) {
    const even = w / n;
    while (offsets.length < n) {
      offsets.push(Math.min(w - 1, Math.round(offsets.length * even + cryptoOffset(Math.max(1, Math.floor(even * 0.4))))));
    }
  }
  return offsets.sort((a, b) => a - b);
}

module.exports = {
  WINDOW_MS,
  SHOTS_PER_WINDOW,
  MIN_GAP_MS,
  DEFAULT_WINDOW_MINUTES,
  DEFAULT_SHOTS_PER_WINDOW,
  MIN_WINDOW_MINUTES,
  MAX_WINDOW_MINUTES,
  MIN_SHOTS_PER_WINDOW,
  MAX_SHOTS_PER_WINDOW,
  normalizeRandomScreenshotSchedule,
  generateRandomScreenshotOffsets,
};
