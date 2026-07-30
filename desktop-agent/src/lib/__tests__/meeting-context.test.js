'use strict';

const {
  isVideoMeetingContext,
  isGoogleMeetContext,
  applyMeetingActivityFloor,
  detectVideoMeeting,
  noteMeetingContext,
  getRecentMeetingLabel,
  isInMeetingSession,
  clearMeetingSession,
  _resetMeetingSessionForTests,
  _setPresenceForTests,
  MEETING_ACTIVITY_FLOOR_PERCENT,
  MEETING_TAB_SWITCH_GRACE_MS,
} = require('../meeting-context');

const {
  isActiveGoogleMeetCallUrl,
  isZoomOrTeamsCallTitle,
} = require('../meeting-presence-probe');

describe('meeting-context', () => {
  beforeEach(() => {
    _resetMeetingSessionForTests();
  });

  test('detects Google Meet from Chrome tab titles', () => {
    expect(isGoogleMeetContext({ appName: 'Google Chrome', windowTitle: 'Meet - abc-defg-hij' })).toBe(true);
    expect(isGoogleMeetContext({ windowTitle: 'Meet - Sync with Thiru - Google Chrome' })).toBe(true);
  });

  test('detects Zoom / Teams / Webex', () => {
    expect(isVideoMeetingContext({ appName: 'zoom.us' })).toBe(true);
    expect(detectVideoMeeting({ appName: 'Microsoft Teams' })).toBe('Microsoft Teams');
    expect(detectVideoMeeting({ windowTitle: 'Webex Meeting' })).toBe('Webex');
  });

  test('detects Google Meet from URL when title is only the meeting name', () => {
    expect(
      detectVideoMeeting({
        appName: 'Google Chrome',
        windowTitle: '[POA] - SMS & UCT Events Discussion',
        url: 'https://meet.google.com/fsj-msbw-ywi',
      })
    ).toBe('Google Meet');
  });

  test('floors activity while live presence says meeting is still open (even on docs tab)', () => {
    _setPresenceForTests({ active: true, label: 'Google Meet' });
    expect(isInMeetingSession()).toBe(true);
    expect(
      applyMeetingActivityFloor(0, {
        appName: 'Google Chrome',
        windowTitle: 'Project Docs',
        url: 'https://docs.google.com/document/d/abc',
      })
    ).toBe(MEETING_ACTIVITY_FLOOR_PERCENT);
  });

  test('does NOT floor docs after presence says the call is gone', () => {
    noteMeetingContext({ url: 'https://meet.google.com/fsj-msbw-ywi' });
    // Simulate probe finding no open Meet tab / Zoom window
    _setPresenceForTests({ active: false, label: null });
    // Also expire short grace
    expect(getRecentMeetingLabel(-1)).toBeNull();
    // Force session off
    clearMeetingSession();
    expect(isInMeetingSession()).toBe(false);
    expect(
      applyMeetingActivityFloor(0, {
        appName: 'Google Chrome',
        windowTitle: 'Project Docs',
        url: 'https://docs.google.com/document/d/abc',
      })
    ).toBe(0);
  });

  test('short grace only bridges a couple minutes when probe is unavailable', () => {
    noteMeetingContext({ url: 'https://meet.google.com/fsj-msbw-ywi' });
    expect(getRecentMeetingLabel(MEETING_TAB_SWITCH_GRACE_MS)).toBe('Google Meet');
    expect(getRecentMeetingLabel(-1)).toBeNull();
  });

  test('raises activity floor on direct meeting context', () => {
    expect(
      applyMeetingActivityFloor(0, { windowTitle: 'Google Meet - Daily standup' })
    ).toBe(MEETING_ACTIVITY_FLOOR_PERCENT);
    expect(applyMeetingActivityFloor(0, { appName: 'Mail' })).toBe(0);
  });
});

describe('meeting-presence-probe helpers', () => {
  test('active Meet call URLs vs lobby/left pages', () => {
    expect(isActiveGoogleMeetCallUrl('https://meet.google.com/fsj-msbw-ywi')).toBe(true);
    expect(isActiveGoogleMeetCallUrl('https://meet.google.com/abc-defg-hij?authuser=0')).toBe(true);
    expect(isActiveGoogleMeetCallUrl('https://meet.google.com/')).toBe(false);
    expect(isActiveGoogleMeetCallUrl('https://meet.google.com/landing')).toBe(false);
    expect(isActiveGoogleMeetCallUrl('https://docs.google.com')).toBe(false);
  });

  test('Zoom/Teams call window titles', () => {
    expect(isZoomOrTeamsCallTitle('Zoom Meeting', 'zoom.us')).toBe(true);
    expect(isZoomOrTeamsCallTitle('Daily standup | Microsoft Teams', 'Microsoft Teams')).toBe(true);
    expect(isZoomOrTeamsCallTitle('Inbox', 'Mail')).toBe(false);
  });
});
