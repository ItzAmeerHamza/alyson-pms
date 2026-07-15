'use strict';

/**
 * Video meetings often have little keyboard/mouse input while still being productive.
 * When detected on a screenshot, activity is floored so the period is not low-activity.
 */
const MEETING_ACTIVITY_FLOOR_PERCENT = 50;

const VIDEO_MEETING_CHECKS = [
  { test: (hay) => /google meet|meet\.google\.com/.test(hay), label: 'Google Meet' },
  { test: (hay) => /\bmeet\s+-/.test(hay), label: 'Google Meet' },
  { test: (hay) => /\b[a-z]{3}-[a-z]{4}-[a-z]{3}\b/.test(hay), label: 'Google Meet' },
  { test: (hay) => /zoom meeting|zoom\.us|zoom workplace|^zoom$/.test(hay), label: 'Zoom' },
  { test: (hay) => /\bzoom\b/.test(hay) && /meeting|webinar|personal room|waiting room/.test(hay), label: 'Zoom' },
  // Microsoft Teams window titles during a call are just the meeting subject
  // (no reliable keyword), so treat any Teams window as a meeting context.
  { test: (hay) => /microsoft teams|teams\.microsoft\.com|\bms-?teams\b/.test(hay), label: 'Microsoft Teams' },
  { test: (hay) => /cisco webex|\bwebex\b/.test(hay), label: 'Webex' },
];

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
  if (!isVideoMeetingContext(context)) return pct;
  return Math.max(pct, MEETING_ACTIVITY_FLOOR_PERCENT);
}

/**
 * Meetings are frequently backgrounded (e.g. the user focuses another window while
 * screen-sharing), so the meeting window/URL is not always the foreground context at
 * the exact moment a screenshot is taken. We remember when a meeting was last seen so
 * activity can still be floored for a short grace period after the meeting loses focus.
 */
const MEETING_PRESENCE_GRACE_MS = 4 * 60 * 1000;
let _lastMeetingAt = 0;
let _lastMeetingLabel = null;

/** Record a context; if it is a meeting, refresh the "recently in a meeting" state. */
function noteMeetingContext(context) {
  const label = detectVideoMeeting(context);
  if (label) {
    _lastMeetingAt = Date.now();
    _lastMeetingLabel = label;
  }
  return label;
}

/** Meeting label if a meeting was seen within `graceMs`, else null. */
function getRecentMeetingLabel(graceMs = MEETING_PRESENCE_GRACE_MS) {
  if (!_lastMeetingAt) return null;
  if (Date.now() - _lastMeetingAt <= graceMs) return _lastMeetingLabel;
  return null;
}

module.exports = {
  MEETING_ACTIVITY_FLOOR_PERCENT,
  MEETING_PRESENCE_GRACE_MS,
  detectVideoMeeting,
  isVideoMeetingContext,
  isGoogleMeetContext,
  applyMeetingActivityFloor,
  noteMeetingContext,
  getRecentMeetingLabel,
};
