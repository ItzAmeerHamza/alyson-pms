'use strict';

const {
  isVideoMeetingContext,
  isGoogleMeetContext,
  applyMeetingActivityFloor,
  detectVideoMeeting,
  noteMeetingContext,
  getRecentMeetingLabel,
  isInMeetingSession,
  refreshMeetingPresence,
  restoreMeetingAfterBriefStop,
  clearMeetingSession,
  _resetMeetingSessionForTests,
  _setPresenceForTests,
  MEETING_ACTIVITY_FLOOR_PERCENT,
  MEETING_TAB_SWITCH_GRACE_MS,
} = require('../meeting-context');

const {
  isActiveGoogleMeetCallUrl,
  isVideoMeetingUrl,
  isGoogleMeetWindowTitle,
  isZoomOrTeamsCallTitle,
  isMeetingBrowserTabTitle,
  tabEvidenceLooksLikeMeeting,
  parseCdpTabTargets,
} = require('../meeting-presence-probe');

describe('meeting-context', () => {
  beforeEach(() => {
    _resetMeetingSessionForTests();
  });

  test('detects Google Meet from Chrome tab titles', () => {
    expect(isGoogleMeetContext({ appName: 'Google Chrome', windowTitle: 'Meet - abc-defg-hij' })).toBe(true);
    expect(isGoogleMeetContext({ windowTitle: 'Meet - Sync with Thiru - Google Chrome' })).toBe(true);
  });

  test('detects Zoom / Teams / Webex / Skype desktop apps', () => {
    expect(isVideoMeetingContext({ appName: 'zoom.us' })).toBe(true);
    expect(detectVideoMeeting({ appName: 'Microsoft Teams' })).toBe('Microsoft Teams');
    expect(detectVideoMeeting({ windowTitle: 'Webex Meeting' })).toBe('Webex');
    expect(detectVideoMeeting({ appName: 'Skype' })).toBe('Skype');
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

  test('probe-confirmed open call stays a meeting for hours (Word on screen, Zoom still open)', () => {
    _setPresenceForTests({ active: true, label: 'Zoom' });
    const fourHoursLater = Date.now() + 4 * 60 * 60 * 1000;
    expect(isInMeetingSession(fourHoursLater)).toBe(true);
    expect(
      applyMeetingActivityFloor(0, {
        appName: 'Microsoft Word',
        windowTitle: 'Notes.docx',
      }),
    ).toBe(MEETING_ACTIVITY_FLOOR_PERCENT);
  });

  test('2-hour meeting with Word in front stays effective (browser Meet, probe cannot see the tab)', async () => {
    noteMeetingContext({
      appName: 'Google Chrome',
      windowTitle: 'Meet - Daily Sync - Google Chrome',
    });
    await refreshMeetingPresence({
      probe: { active: false, conclusive: false, label: null },
    });
    const twoHoursLater = Date.now() + 2 * 60 * 60 * 1000;
    expect(isInMeetingSession(twoHoursLater)).toBe(true);
    expect(
      applyMeetingActivityFloor(0, {
        appName: 'Microsoft Word',
        windowTitle: 'Notes.docx',
      }),
    ).toBe(MEETING_ACTIVITY_FLOOR_PERCENT);
  });

  test('detects Skype desktop and browser', () => {
    expect(detectVideoMeeting({ appName: 'Skype' })).toBe('Skype');
    expect(detectVideoMeeting({ windowTitle: 'Standup | Skype' })).toBe('Skype');
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
    // Presence probe unknown — grace is the last foreground sighting only.
    _setPresenceForTests({ active: false, label: null });
    expect(getRecentMeetingLabel(MEETING_TAB_SWITCH_GRACE_MS)).toBe('Google Meet');
    expect(getRecentMeetingLabel(-1)).toBeNull();
  });

  test('detects meet.com the same as meet.google.com', () => {
    expect(
      detectVideoMeeting({
        appName: 'Google Chrome',
        url: 'https://meet.com/abc-defg-hij',
      }),
    ).toBe('Google Meet');
  });

  test('Windows-inconclusive probe does not wipe an in-progress meeting', async () => {
    noteMeetingContext({
      appName: 'Google Chrome',
      windowTitle: 'Meet - SMS Capacity Sync - Google Chrome',
    });
    expect(isInMeetingSession()).toBe(true);
    const kept = await refreshMeetingPresence({
      probe: { active: false, conclusive: false, label: null },
    });
    expect(kept).toBe('Google Meet');
    expect(isInMeetingSession()).toBe(true);
    expect(
      applyMeetingActivityFloor(0, {
        appName: 'Signal',
        windowTitle: 'Signal (3)',
      }),
    ).toBe(MEETING_ACTIVITY_FLOOR_PERCENT);
  });

  test('conclusive probe miss ends the meeting floor', async () => {
    noteMeetingContext({ url: 'https://meet.google.com/fsj-msbw-ywi' });
    const ended = await refreshMeetingPresence({
      probe: { active: false, conclusive: true, label: null },
    });
    expect(ended).toBeNull();
    expect(isInMeetingSession()).toBe(false);
    expect(
      applyMeetingActivityFloor(0, {
        appName: 'Google Chrome',
        windowTitle: 'Project Docs',
      }),
    ).toBe(0);
  });

  test('restores meeting presence after a brief Stop/Start', () => {
    noteMeetingContext({
      appName: 'Google Chrome',
      windowTitle: 'Meet - SMS Capacity Sync - Google Chrome',
    });
    clearMeetingSession();
    expect(isInMeetingSession()).toBe(false);
    expect(restoreMeetingAfterBriefStop()).toBe('Google Meet');
    expect(isInMeetingSession()).toBe(true);
  });

  test('does not restore a meeting after the brief-stop window', () => {
    noteMeetingContext({ url: 'https://meet.google.com/fsj-msbw-ywi' });
    clearMeetingSession();
    expect(restoreMeetingAfterBriefStop(Date.now() + 3 * 60 * 1000)).toBeNull();
    expect(isInMeetingSession()).toBe(false);
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
    expect(isActiveGoogleMeetCallUrl('https://meet.com/abc-defg-hij')).toBe(true);
  });

  test('Chrome Meet window titles (Windows probe)', () => {
    expect(
      isGoogleMeetWindowTitle('Meet - SMS Capacity Sync - Google Chrome', 'Google Chrome'),
    ).toBe(true);
    expect(isGoogleMeetWindowTitle('Signal (3)', 'Signal')).toBe(false);
  });

  test('Windows tab-strip titles match the same Meet/Zoom calls as Mac tab URLs', () => {
    expect(isMeetingBrowserTabTitle('Meet - Daily Sync')).toBe(true);
    expect(isMeetingBrowserTabTitle('Meet - abc-defg-hij')).toBe(true);
    expect(isMeetingBrowserTabTitle('Zoom Meeting')).toBe(true);
    expect(isMeetingBrowserTabTitle('Inbox - Gmail')).toBe(false);
    expect(isVideoMeetingUrl('https://zoom.us/j/123456789')).toBe(true);
    expect(isVideoMeetingUrl('https://docs.google.com/document/d/abc')).toBe(false);

    expect(
      tabEvidenceLooksLikeMeeting({
        urls: ['https://meet.google.com/fsj-msbw-ywi'],
        titles: ['Project Docs'],
      }).hit,
    ).toBe(true);
    expect(
      tabEvidenceLooksLikeMeeting({
        urls: [],
        titles: ['Gmail', 'Meet - SMS Capacity Sync', 'Word Online'],
      }),
    ).toEqual({ hit: true, label: 'Google Meet' });
    expect(tabEvidenceLooksLikeMeeting({ urls: [], titles: ['Gmail', 'Docs'] }).hit).toBe(false);
  });

  test('parses Chrome CDP /json tab targets the same way Windows URL capture does', () => {
    const parsed = parseCdpTabTargets([
      { type: 'page', url: 'https://meet.google.com/abc-defg-hij', title: 'Meet - Daily Sync' },
      { type: 'page', url: 'https://docs.google.com/document/d/x', title: 'Notes' },
      { type: 'service_worker', url: 'https://meet.google.com/sw', title: '' },
    ]);
    expect(parsed.urls).toEqual([
      'https://meet.google.com/abc-defg-hij',
      'https://docs.google.com/document/d/x',
    ]);
    expect(tabEvidenceLooksLikeMeeting(parsed)).toEqual({ hit: true, label: 'Google Meet' });
  });

  test('Zoom/Teams call window titles', () => {
    expect(isZoomOrTeamsCallTitle('Zoom Meeting', 'zoom.us')).toBe(true);
    expect(isZoomOrTeamsCallTitle('Daily standup | Microsoft Teams', 'Microsoft Teams')).toBe(true);
    expect(isZoomOrTeamsCallTitle('Inbox', 'Mail')).toBe(false);
  });
});
