'use strict';

/**
 * Video meetings are effective time for the whole call — browser tab or desktop app.
 * Word / docs / Slack in front with no typing does not make those hours idle or low-activity.
 *
 * Policy:
 * - Foreground Meet / Zoom / Teams / Webex / Skype → in a meeting.
 * - Background: Mac Chrome-family tab URLs; Windows CDP + Chrome/Edge tab-strip
 *   titles; any open Zoom/Teams/Meet/Skype window on both.
 * - If the probe cannot list tabs (UIA/CDP failed) we keep the meeting until a
 *   conclusive miss. A 2-hour call with Word in front stays effective.
 * - 2-min grace only when we never confirmed presence and the probe cannot run.
 * - Idle auto-stop is separate: after 10 min of OS idle the still-working
 *   prompt still fires. Leftover Meet / Zoom / Teams / Webex / Skype tabs
 *   or desktop windows must not keep tracking all day.
 * - Lid close / OS sleep always stops tracking, even if a meeting is still open.
 */

const MEETING_ACTIVITY_FLOOR_PERCENT = 50;

/** Short bridge for tab switches when presence probe is unavailable/slow. */
const MEETING_TAB_SWITCH_GRACE_MS = 2 * 60 * 1000;

/** @deprecated kept for older imports — now equals short grace, not 90m */
const MEETING_PRESENCE_GRACE_MS = MEETING_TAB_SWITCH_GRACE_MS;

const VIDEO_MEETING_CHECKS = [
  { test: (hay) => /google meet|meet\.google\.com|(^|[/.])meet\.com([/?#:\s]|$)/.test(hay), label: 'Google Meet' },
  { test: (hay) => /\bmeet\s+-/.test(hay), label: 'Google Meet' },
  { test: (hay) => /\b[a-z]{3}-[a-z]{4}-[a-z]{3}\b/.test(hay), label: 'Google Meet' },
  { test: (hay) => /zoom meeting|zoom\.us|zoom workplace|^zoom$/.test(hay), label: 'Zoom' },
  { test: (hay) => /\bzoom\b/.test(hay) && /meeting|webinar|personal room|waiting room/.test(hay), label: 'Zoom' },
  { test: (hay) => /microsoft teams|teams\.microsoft\.com|\bms-?teams\b/.test(hay), label: 'Microsoft Teams' },
  { test: (hay) => /cisco webex|\bwebex\b/.test(hay), label: 'Webex' },
  { test: (hay) => /\bskype\b/.test(hay), label: 'Skype' },
];

let _lastMeetingAt = 0;
let _lastMeetingLabel = null;
let _presenceActive = false;
let _presenceLabel = null;
let _presenceCheckedAt = 0;
/** Remember a meeting across a brief Stop/Start (Mohita Stop/Start 8× mid-call). */
let _clearedMeetingLabel = null;
let _clearedMeetingAt = 0;
const BRIEF_STOP_RESTORE_MS = 2 * 60 * 1000;

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
  if (app === 'skype' || app.startsWith('skype')) {
    return 'Skype';
  }
  if (app === 'google meet' || app === 'meet') {
    return 'Google Meet';
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
  // Confirmed open call has no time cap — 2 hours of Word notes stay a meeting.
  if (_presenceActive && _presenceLabel) return true;
  if (!_lastMeetingAt || !_lastMeetingLabel) return false;
  return now - _lastMeetingAt <= MEETING_TAB_SWITCH_GRACE_MS;
}

function noteMeetingContext(context) {
  const label = detectVideoMeeting(context);
  if (label) {
    _lastMeetingAt = Date.now();
    _lastMeetingLabel = label;
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
    const probe = options.probe || (await probeMeetingStillOpen(options));
    _presenceCheckedAt = Date.now();
    if (probe.active) {
      _presenceActive = true;
      _presenceLabel = probe.label || _lastMeetingLabel || 'Video meeting';
      _lastMeetingAt = Date.now();
      _lastMeetingLabel = _presenceLabel;
      return _presenceLabel;
    }

    if (probe.conclusive === false) {
      // Probe could not list browser tabs (Windows UIA/CDP miss). Word in front
      // is not "the call ended". Keep the meeting so notes stay effective.
      if (_lastMeetingLabel || _presenceLabel) {
        _presenceActive = true;
        _presenceLabel = _presenceLabel || _lastMeetingLabel;
        return _presenceLabel;
      }
      return getRecentMeetingLabel();
    }

    // Probe could see every tab / native call window and found nothing.
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
  if (_presenceActive && _presenceLabel) {
    _clearedMeetingLabel = _presenceLabel;
    _clearedMeetingAt = Date.now();
  }
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

/** After a mid-call Stop/Start, put the meeting floor back so idle is not written. */
function restoreMeetingAfterBriefStop(now = Date.now()) {
  if (!_clearedMeetingLabel || !_clearedMeetingAt) return null;
  if (now - _clearedMeetingAt > BRIEF_STOP_RESTORE_MS) {
    _clearedMeetingLabel = null;
    _clearedMeetingAt = 0;
    return null;
  }
  _presenceActive = true;
  _presenceLabel = _clearedMeetingLabel;
  _lastMeetingAt = now;
  _lastMeetingLabel = _clearedMeetingLabel;
  _presenceCheckedAt = now;
  return _presenceLabel;
}

async function primeMeetingPresenceOnStart() {
  const restored = restoreMeetingAfterBriefStop();
  if (restored) return restored;
  return refreshMeetingPresence();
}

function _resetMeetingSessionForTests() {
  _clearedMeetingLabel = null;
  _clearedMeetingAt = 0;
  clearMeetingSession();
  _clearedMeetingLabel = null;
  _clearedMeetingAt = 0;
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
  restoreMeetingAfterBriefStop,
  primeMeetingPresenceOnStart,
  BRIEF_STOP_RESTORE_MS,
  clearMeetingSession,
  _resetMeetingSessionForTests,
  _setPresenceForTests,
};
