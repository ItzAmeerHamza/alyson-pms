/**
 * Effective / non-effective seconds from tracked + idle + low activity.
 *
 * non_effective = min(total, low + idle)
 * effective     = total - non_effective
 *
 * Product rule: non-effective is for display / payroll split only.
 * The main tracked clock is full tracked time (except the authorized 10m idle-prompt cut).
 */
function computeEffectiveSeconds(totalSeconds, lowSeconds, idleSeconds) {
  const total = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const low = Math.max(0, Math.floor(Number(lowSeconds) || 0));
  const idle = Math.max(0, Math.floor(Number(idleSeconds) || 0));
  const nonEffective = Math.min(total, low + idle);
  return {
    totalSeconds: total,
    nonEffectiveSeconds: nonEffective,
    effectiveSeconds: Math.max(0, total - nonEffective),
  };
}

/**
 * Product rule: the big clock and the Effective / Non-effective cards are live.
 * They already classify time as it happens. Stop / Pause must not rewrite them.
 *
 * While tracking, Pulse + in-session idle both move the cards in real time.
 * After Stop, keep the last painted split — a late Pulse read is the jump.
 */
const MIN_IDLE_REPORT_SECONDS = 5 * 60;

function resolveLiveNonEffectiveSeconds({
  pulseNonEffective = 0,
  nonEffectiveAtLiveStart = 0,
  sessionIdleSeconds = 0,
  lastDisplayed = 0,
  isLive = false,
  minIdleReportSeconds = MIN_IDLE_REPORT_SECONDS,
} = {}) {
  const pulse = Math.max(0, Math.floor(Number(pulseNonEffective) || 0));
  const atStart = Math.max(0, Math.floor(Number(nonEffectiveAtLiveStart) || 0));
  const sessionIdle = Math.max(0, Math.floor(Number(sessionIdleSeconds) || 0));
  const painted = Math.max(0, Math.floor(Number(lastDisplayed) || 0));
  const reportable = sessionIdle >= minIdleReportSeconds ? sessionIdle : 0;
  const liveSplit = atStart + reportable;
  if (!isLive) {
    return Math.max(painted, liveSplit);
  }
  return Math.max(pulse, liveSplit, painted);
}

/**
 * Exact screenshot interval in seconds from the live capturer.
 * Must be identical for Today cards and Month at a Glance — minute rounding
 * previously caused ~3× non-effective mismatches (34m vs 1h 42m).
 */
function resolveScreenshotIntervalSeconds(config = global.config) {
  try {
    const mgr = global?.enhancedScreenshotManager;
    if (mgr && typeof mgr.getEffectiveLowActivityIntervalSeconds === 'function') {
      const seconds = Number(mgr.getEffectiveLowActivityIntervalSeconds());
      if (Number.isFinite(seconds) && seconds > 0) {
        return Math.max(10, Math.round(seconds));
      }
    }
    if (mgr && typeof mgr.getConfiguredScreenshotIntervalMs === 'function') {
      const ms = Number(mgr.getConfiguredScreenshotIntervalMs());
      if (Number.isFinite(ms) && ms > 0) {
        return Math.max(10, Math.round(ms / 1000));
      }
    }
  } catch (_) {
    /* ignore */
  }

  const fromMinutes =
    config?.screenshot_interval_minutes ??
    config?.screenshotIntervalMinutes ??
    config?.appSettings?.screenshot_interval_minutes ??
    global?.appSettings?.screenshot_interval_minutes ??
    global?.configManager?.appSettings?.screenshot_interval_minutes ??
    global?.config?.screenshot_interval_minutes;

  const minutesNum = Number(fromMinutes);
  if (Number.isFinite(minutesNum) && minutesNum > 0) {
    return Math.max(10, Math.round(minutesNum * 60));
  }

  const rawSeconds =
    config?.screenshot_interval_seconds ??
    config?.appSettings?.screenshot_interval_seconds ??
    global?.appSettings?.screenshot_interval_seconds ??
    global?.configManager?.appSettings?.screenshot_interval_seconds ??
    global?.config?.screenshot_interval_seconds;

  const secondsNum = Number(rawSeconds);
  if (Number.isFinite(secondsNum) && secondsNum > 0) {
    const seconds = secondsNum >= 1000 ? Math.round(secondsNum / 1000) : secondsNum;
    return Math.max(10, Math.round(seconds));
  }

  return 60; // match enhanced-screenshot-manager default
}

/** @deprecated use resolveScreenshotIntervalSeconds — kept for callers */
function resolveScreenshotIntervalMinutes(config = global.config) {
  return Math.max(1, Math.round(resolveScreenshotIntervalSeconds(config) / 60) || 1);
}

module.exports = {
  computeEffectiveSeconds,
  resolveLiveNonEffectiveSeconds,
  MIN_IDLE_REPORT_SECONDS,
  resolveScreenshotIntervalSeconds,
  resolveScreenshotIntervalMinutes,
};
