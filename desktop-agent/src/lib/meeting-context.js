'use strict';

/**
 * Video meetings often have little keyboard/mouse input while still being productive.
 *
 * Policy:
 * - Floor activity while the *foreground* context is a meeting, OR
 * - Floor while a live probe still sees an open Meet tab / Zoom|Teams call window.
 * - Brief tab-switch grace (2 min) only as a fallback when the probe can't run.
 * - Do NOT use a long sticky window after the call ends.
 */

const MEETING_ACTIVITY_FLOOR_PERCENT = 50;

/** Short bridge for tab switches when presence probe is unavailable/slow. */
const MEETING_TAB_SWITCH_GRACE_MS = 2 * 60 * 1000;

/** @deprecated kept for older imports — now equals short grace, not 90m */
const MEETING_PRESENCE_GRACE_MS = MEETING_TAB_SWITCH_GRACE_MS;

const VIDEO_MEETING_CHECKS = [
  { test: (hay) => /google meet|meet\.google\.com/.test(hay), label: 'Google Meet' },
  { test: (hay) => /\bmeet\s+-/.test(hay), label: 'Google Meet' },
  { test: (hay) => /\b[a-z]{3}-[a-z]{4}-[a-z]{3}\b/.test(hay), label: 'Google Meet' },
  { test: (hay) => /zoom meeting|zoom\.us|zoom workplace|^zoom$/.test(hay), label: 'Zoom' },
  { test: (hay) => /\bzoom\b/.test(hay) && /meeting|webinar|personal room|waiting room/.test(hay), label: 'Zoom' },
  { test: (hay) => /microsoft teams|teams\.microsoft\.com|\bms-?teams\b/.test(hay), label: 'Microsoft Teams' },
  { test: (hay) => /cisco webex|\bwebex\b/.test(hay), label: 'Webex' },
];

let _lastMeetingAt = 0;
let _lastMeetingLabel = null;
let _presenceActive = false;
let _presenceLabel = null;
let _presenceCheckedAt = 0;

function buildContextHaystack({ appName, windowTitle, url } = {}) {
  return [appName, windowTitle, url].filter(Boolean).join(' ').toLowerCase();
}

function detectVideoMeeting(context) {
  const haystack = buildContextHaystack(context);
  if (!haystack) return null;

  for (const check of VIDEO_MEETING_CHECKS) {
    if (check.test(haystack)) return check.label;
  }

  const app = String(context.appName || '').trim().toLowerCase();
  if (app === 'zoom' || app === 'zoom.us' || app.startsWith('zoom workplace')) {
    return 'Zoom';
  }
  if (app.startsWith('microsoft teams') || app === 'teams' || app === 'msteams' || app === 'ms-teams') {
    return 'Microsoft Teams';
  }

  return null;
}

function isVideoMeetingContext(context) {
  return Boolean(detectVideoMeeting(context));
}

/** @deprecated use isVideoMeetingContext */
function isGoogleMeetContext(context) {
  return isVideoMeetingContext(context);
}

function applyMeetingActivityFloor(activityPercent, context) {
  const pct = Number(activityPercent);
  if (!Number.isFinite(pct)) return activityPercent;
  if (isVideoMeetingContext(context) || isInMeetingSession()) {
    return Math.max(pct, MEETING_ACTIVITY_FLOOR_PERCENT);
  }
  return pct;
}

/**
 * True when we have evidence of an active call:
 * - live presence probe said yes, OR
 * - very recent foreground meeting sighting (short grace only)
 */
function isInMeetingSession(now = Date.now()) {
  if (_presenceActive && _presenceLabel) return true;
  if (!_lastMeetingAt || !_lastMeetingLabel) return false;
  return now - _lastMeetingAt <= MEETING_TAB_SWITCH_GRACE_MS;
}

function noteMeetingContext(context) {
  const label = detectVideoMeeting(context);
  if (label) {
    _lastMeetingAt = Date.now();
    _lastMeetingLabel = label;
    // Foreground meeting also counts as presence until the next probe says otherwise
    _presenceActive = true;
    _presenceLabel = label;
    _presenceCheckedAt = Date.now();
  }
  return label;
}

function getRecentMeetingLabel(graceMs = MEETING_TAB_SWITCH_GRACE_MS) {
  if (_presenceActive && _presenceLabel) return _presenceLabel;
  if (!_lastMeetingAt || !_lastMeetingLabel) return null;
  if (Date.now() - _lastMeetingAt > graceMs) return null;
  return _lastMeetingLabel;
}

/**
 * Refresh live presence (open Meet tab / Zoom window). Call before flooring activity.
 * If probe finds no call, clears sticky presence so post-meeting docs are not floored.
 */
async function refreshMeetingPresence(options = {}) {
  try {
    const { probeMeetingStillOpen } = require('./meeting-presence-probe');
    const probe = await probeMeetingStillOpen(options);
    _presenceCheckedAt = Date.now();
    if (probe.active) {
      _presenceActive = true;
      _presenceLabel = probe.label || _lastMeetingLabel || 'Video meeting';
      _lastMeetingAt = Date.now();
      _lastMeetingLabel = _presenceLabel;
      return _presenceLabel;
    }

    // Probe ran and found nothing — call is over / Meet tab closed.
    // Clear presence AND short grace so post-meeting docs aren't floored.
    _presenceActive = false;
    _presenceLabel = null;
    _lastMeetingAt = 0;
    _lastMeetingLabel = null;
    return null;
  } catch (err) {
    console.warn('[MEETING] presence probe failed:', err?.message || err);
    // Keep short grace only; do not invent a long sticky window
    return getRecentMeetingLabel();
  }
}

function clearMeetingSession() {
  _lastMeetingAt = 0;
  _lastMeetingLabel = null;
  _presenceActive = false;
  _presenceLabel = null;
  _presenceCheckedAt = 0;
  try {
    const { clearMeetingPresenceCache } = require('./meeting-presence-probe');
    clearMeetingPresenceCache();
  } catch (_) {}
}

function _resetMeetingSessionForTests() {
  clearMeetingSession();
}

function _setPresenceForTests({ active, label } = {}) {
  _presenceActive = !!active;
  _presenceLabel = label || null;
  _presenceCheckedAt = Date.now();
  if (active && label) {
    _lastMeetingAt = Date.now();
    _lastMeetingLabel = label;
  }
}

module.exports = {
  MEETING_ACTIVITY_FLOOR_PERCENT,
  MEETING_PRESENCE_GRACE_MS,
  MEETING_TAB_SWITCH_GRACE_MS,
  detectVideoMeeting,
  isVideoMeetingContext,
  isGoogleMeetContext,
  applyMeetingActivityFloor,
  noteMeetingContext,
  getRecentMeetingLabel,
  isInMeetingSession,
  refreshMeetingPresence,
  clearMeetingSession,
  _resetMeetingSessionForTests,
  _setPresenceForTests,
};
