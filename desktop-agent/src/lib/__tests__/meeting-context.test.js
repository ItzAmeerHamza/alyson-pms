'use strict';

const {
  isVideoMeetingContext,
  isGoogleMeetContext,
  applyMeetingActivityFloor,
  detectVideoMeeting,
  noteMeetingContext,
  getRecentMeetingLabel,
  MEETING_ACTIVITY_FLOOR_PERCENT,
} = require('../meeting-context');

describe('meeting-context', () => {
  test('detects Google Meet from Chrome tab titles', () => {
    expect(isGoogleMeetContext({ appName: 'Google Chrome', windowTitle: 'Meet - abc-defg-hij' })).toBe(true);
    expect(isGoogleMeetContext({ windowTitle: 'Meet - Sync with Thiru - Google Chrome' })).toBe(true);
    expect(isGoogleMeetContext({ windowTitle: 'Meet - frw-zkhe-abr - Google Chrome' })).toBe(true);
  });

  test('detects Zoom from app or title', () => {
    expect(isVideoMeetingContext({ appName: 'zoom.us' })).toBe(true);
    expect(isVideoMeetingContext({ windowTitle: 'Zoom Meeting' })).toBe(true);
    expect(isVideoMeetingContext({ windowTitle: 'Personal Meeting Room - Zoom' })).toBe(true);
    expect(detectVideoMeeting({ appName: 'Zoom Workplace' })).toBe('Zoom');
    expect(isVideoMeetingContext({ appName: 'Slack' })).toBe(false);
  });

  test('detects Microsoft Teams from app or meeting-subject title', () => {
    expect(detectVideoMeeting({ appName: 'Microsoft Teams' })).toBe('Microsoft Teams');
    expect(
      isVideoMeetingContext({ appName: 'Microsoft Teams', windowTitle: 'TFA-04 [FIX] - SWE 4 GT Frame Discussion | Microsoft Teams' })
    ).toBe(true);
    expect(isVideoMeetingContext({ appName: 'ms-teams' })).toBe(true);
    expect(applyMeetingActivityFloor(0, { appName: 'Microsoft Teams' })).toBe(MEETING_ACTIVITY_FLOOR_PERCENT);
  });

  test('detects Webex', () => {
    expect(isVideoMeetingContext({ appName: 'Cisco Webex Meetings' })).toBe(true);
    expect(detectVideoMeeting({ windowTitle: 'Webex Meeting' })).toBe('Webex');
  });

  test('detects Google Meet from the URL when the title is only the meeting name', () => {
    // The Meet tab title is the meeting subject (no "meet" keyword); URL is the signal.
    expect(
      detectVideoMeeting({
        appName: 'Google Chrome',
        windowTitle: '[POA] - SMS & UCT Events Discussion',
        url: 'https://meet.google.com/fsj-msbw-ywi',
      })
    ).toBe('Google Meet');
    // Same context without the URL is NOT detected — this is the original bug.
    expect(
      detectVideoMeeting({
        appName: 'Google Chrome',
        windowTitle: '[POA] - SMS & UCT Events Discussion',
      })
    ).toBeNull();
  });

  test('remembers a recent meeting during the grace window', () => {
    expect(getRecentMeetingLabel(60000)).toBeNull();
    noteMeetingContext({ url: 'https://meet.google.com/fsj-msbw-ywi' });
    expect(getRecentMeetingLabel(60000)).toBe('Google Meet');
    // A subsequent non-meeting context must not clear the recent-meeting memory.
    noteMeetingContext({ appName: 'Code', windowTitle: 'file.js' });
    expect(getRecentMeetingLabel(60000)).toBe('Google Meet');
    // Outside the grace window it is no longer considered active.
    expect(getRecentMeetingLabel(-1)).toBeNull();
  });

  test('raises activity floor on video meetings only', () => {
    expect(
      applyMeetingActivityFloor(0, { windowTitle: 'Google Meet - Daily standup' })
    ).toBe(MEETING_ACTIVITY_FLOOR_PERCENT);
    expect(
      applyMeetingActivityFloor(0, { windowTitle: 'Zoom Meeting' })
    ).toBe(MEETING_ACTIVITY_FLOOR_PERCENT);
    expect(applyMeetingActivityFloor(0, { appName: 'Mail' })).toBe(0);
    expect(
      applyMeetingActivityFloor(80, { appName: 'Google Meet' })
    ).toBe(80);
  });
});
