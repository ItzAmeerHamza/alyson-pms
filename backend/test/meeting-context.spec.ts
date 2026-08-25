import { describe, expect, it } from 'vitest';
import {
  applyMeetingActivityFloor,
  isVideoMeetingScreenshot,
  MEETING_ACTIVITY_FLOOR_PERCENT,
} from '../src/pulse/meeting-context';

describe('isVideoMeetingScreenshot', () => {
  it('detects browser Google Meet titles and meet.com', () => {
    expect(
      isVideoMeetingScreenshot('Google Chrome', 'Meet - SMS Capacity Sync - Google Chrome'),
    ).toBe(true);
    expect(isVideoMeetingScreenshot('Google Chrome', 'meet.google.com/msu-jjhw-vat')).toBe(true);
    expect(isVideoMeetingScreenshot('Google Chrome', 'https://meet.com/jyw-tdez-ubz')).toBe(true);
  });

  it('does not treat Signal or docs as a meeting by title alone', () => {
    expect(isVideoMeetingScreenshot('Signal', 'Signal (3)')).toBe(false);
    expect(isVideoMeetingScreenshot('Google Chrome', 'Inbox - Outlook')).toBe(false);
  });

  it('floors meeting screenshots so they are not low-activity', () => {
    expect(
      applyMeetingActivityFloor(0, 'Google Chrome', 'Meet - Daily Stand-up - Google Chrome'),
    ).toBe(MEETING_ACTIVITY_FLOOR_PERCENT);
    expect(applyMeetingActivityFloor(0, 'Signal', 'Signal (3)')).toBe(0);
  });
});
