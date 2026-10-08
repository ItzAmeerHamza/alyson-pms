import { describe, expect, it } from 'vitest';
import {
  applyMeetingActivityFloor,
  applyMeetingScreenshotPresentation,
  isVideoMeetingScreenshot,
  hasVideoMeetingEvidence,
  isParticipatingMeetingActivity,
  MEETING_ACTIVITY_FLOOR_PERCENT,
} from '../src/pulse/meeting-context';

describe('isVideoMeetingScreenshot', () => {
  it('detects browser Google Meet titles and meet.com', () => {
    expect(
      isVideoMeetingScreenshot('Google Chrome', 'Meet - SMS Capacity Sync - Google Chrome'),
    ).toBe(true);
    expect(isVideoMeetingScreenshot('Google Chrome', 'meet.google.com/msu-jjhw-vat')).toBe(true);
    expect(isVideoMeetingScreenshot('Google Chrome', 'https://meet.com/jyw-tdez-ubz')).toBe(true);
    expect(
      isVideoMeetingScreenshot('Brave Browser', 'Cintara - Microphone recording - Brave - Work'),
    ).toBe(true);
  });

  it('does not treat Signal or docs as a meeting by title alone', () => {
    expect(isVideoMeetingScreenshot('Signal', 'Signal (3)')).toBe(false);
    expect(isVideoMeetingScreenshot('Google Chrome', 'Inbox - Outlook')).toBe(false);
  });

  it('detects Meet in dual-screen OCR even when Word is the focused title', () => {
    expect(
      hasVideoMeetingEvidence(
        'Microsoft Word',
        'Notes.docx',
        'meet.google.com/abc-defg-hij You are presenting',
      ),
    ).toBe(true);
    expect(hasVideoMeetingEvidence('Microsoft Word', 'Notes.docx', 'Recommended videos')).toBe(
      false,
    );
    expect(
      hasVideoMeetingEvidence('Finder', 'No Window', 'Presenting, annotating in Google Meet'),
    ).toBe(true);
  });

  it('floors participating meeting screenshots so they are not low-activity', () => {
    expect(
      applyMeetingActivityFloor(12, 'Google Chrome', 'Meet - Daily Stand-up - Google Chrome'),
    ).toBe(MEETING_ACTIVITY_FLOOR_PERCENT);
    expect(applyMeetingActivityFloor(0, 'Signal', 'Signal (3)')).toBe(0);
  });

  it('does not invent activity for a leftover Meet tab while asleep', () => {
    expect(
      applyMeetingActivityFloor(0, 'Google Chrome', 'Meet - Daily Stand-up - Google Chrome'),
    ).toBe(0);
    expect(
      applyMeetingActivityFloor(2, 'Brave Browser', 'Cintara - Microphone recording - Brave - Work'),
    ).toBe(2);
    const leftover = applyMeetingScreenshotPresentation({
      app_name: 'Google Chrome',
      window_title: 'Meet - Daily Stand-up - Google Chrome',
      activity_percent: 0,
      category: 'neutral',
      is_work_related: false,
    });
    expect(leftover.activity_percent).toBe(0);
    expect(leftover.category).toBe('neutral');
    expect(isParticipatingMeetingActivity(0)).toBe(false);
    expect(isParticipatingMeetingActivity(2)).toBe(false);
    expect(isParticipatingMeetingActivity(MEETING_ACTIVITY_FLOOR_PERCENT)).toBe(true);
    expect(isParticipatingMeetingActivity(null)).toBe(true);
  });

  it('presents stored Neutral Cintara Meet tabs as productive and not low-activity', () => {
    const out = applyMeetingScreenshotPresentation({
      app_name: 'Brave Browser',
      window_title: 'Cintara - Microphone recording - Brave - Work',
      vision_summary: 'Garbled OCR from the other monitor.',
      activity_percent: MEETING_ACTIVITY_FLOOR_PERCENT,
      focus_percent: MEETING_ACTIVITY_FLOOR_PERCENT,
      category: 'neutral',
      is_work_related: false,
      distraction_score: 50,
      confidence_score: 20,
      activity_type: 'general',
      productivity_flag: 'mixed',
    });
    expect(out.category).toBe('productive');
    expect(out.is_work_related).toBe(true);
    expect(out.distraction_score).toBe(0);
    expect(out.activity_percent).toBe(MEETING_ACTIVITY_FLOOR_PERCENT);
    expect(out.confidence_score).toBeGreaterThanOrEqual(70);
    expect(out.productivity_flag).toBe('on_task');
  });

  it('presents dual-screen Word + Meet OCR as productive and not low-activity', () => {
    const out = applyMeetingScreenshotPresentation({
      app_name: 'Microsoft Word',
      window_title: 'Notes.docx',
      vision_summary: 'Presenting, annotating in Google Meet on the other screen.',
      activity_percent: MEETING_ACTIVITY_FLOOR_PERCENT,
      category: 'neutral',
      is_work_related: false,
      distraction_score: 45,
      confidence_score: 40,
    });
    expect(out.category).toBe('productive');
    expect(out.is_work_related).toBe(true);
    expect(out.activity_percent).toBe(MEETING_ACTIVITY_FLOOR_PERCENT);
  });

  it('does not treat filename 3-4-3 slugs or calendar chatter as meetings', () => {
    expect(
      isVideoMeetingScreenshot('Cursor', 'pulse-cost-research-brief.md — Untitled (Workspace)'),
    ).toBe(false);
    expect(
      hasVideoMeetingEvidence(
        'Cursor',
        'reorg-the-repo-and-make-a-process',
        'Editing a markdown file in Cursor',
      ),
    ).toBe(false);
    expect(
      hasVideoMeetingEvidence(
        'Google Chrome',
        'cintara.ai - Calendar - Week of August 16, 2026 - Google Chrome',
        'The employee is viewing their Google Calendar. A Google Meet event is listed for later.',
      ),
    ).toBe(false);
    expect(
      hasVideoMeetingEvidence(
        'Google Chrome',
        'Inbox - Gmail - Google Chrome',
        'Gmail inbox with a thread about the daily stand-up Google Meet invite.',
      ),
    ).toBe(false);
    expect(
      hasVideoMeetingEvidence(
        'Google Chrome',
        'Inbox - Gmail - Google Chrome',
        'meet.google.com/abc-defg-hij Join now',
      ),
    ).toBe(false);
  });

  it('does not treat lobby / waiting room / Join now as a live call', () => {
    expect(
      isVideoMeetingScreenshot('Google Chrome', 'Ask to join - Meet - Daily Stand-up'),
    ).toBe(false);
    expect(
      isVideoMeetingScreenshot('Zoom', 'Waiting Room - Zoom Meeting'),
    ).toBe(false);
    expect(
      hasVideoMeetingEvidence(
        'Google Chrome',
        'Meet - Daily Stand-up - Google Chrome',
        'Ask to join this meeting. Join now.',
      ),
    ).toBe(false);
  });

  it('does not treat Teams or Skype chat as a call', () => {
    expect(isVideoMeetingScreenshot('Microsoft Teams', 'Chat | Jane | Microsoft Teams')).toBe(
      false,
    );
    expect(isVideoMeetingScreenshot('Skype', 'Jane Doe | Skype')).toBe(false);
    expect(
      isVideoMeetingScreenshot('Microsoft Teams', 'Call with Jane | Microsoft Teams'),
    ).toBe(true);
    expect(isVideoMeetingScreenshot('Skype', 'Call with Jane - Skype')).toBe(true);
  });

  it('ignores leftover left-the-call pages even when the tab still says Meet', () => {
    expect(
      hasVideoMeetingEvidence(
        'Google Chrome',
        'Meet - Daily Stand-up - Google Chrome',
        'You left the meeting. Return to home.',
      ),
    ).toBe(false);
  });

  it('uses Tesseract OCR excerpt when vision summary is vague', () => {
    const out = applyMeetingScreenshotPresentation({
      app_name: 'Microsoft Word',
      window_title: 'Notes.docx',
      vision_summary: 'Working in a document on the other monitor.',
      ocr_excerpt: 'meet.google.com/jyw-tdez-ubz You are presenting Leave call',
      activity_percent: MEETING_ACTIVITY_FLOOR_PERCENT,
      category: 'neutral',
      is_work_related: false,
      distraction_score: 40,
    });
    expect(out.category).toBe('productive');
    expect(out.activity_percent).toBe(MEETING_ACTIVITY_FLOOR_PERCENT);
  });
});
