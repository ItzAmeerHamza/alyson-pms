/**
 * Pulse-side non-effective split for the same Mac / Windows meeting cases
 * the desktop agent probes. Formula is platform-agnostic; meeting minutes
 * must not land in idle or low-activity.
 *
 *   non_effective = min(total, idle + low_activity)
 */
import { describe, expect, it } from 'vitest';
import { computeEffectiveTime } from '../src/lib/effective-time';
import {
  applyMeetingActivityFloor,
  isVideoMeetingScreenshot,
  MEETING_ACTIVITY_FLOOR_PERCENT,
} from '../src/pulse/meeting-context';
import {
  mergeCapturedAtsIntoIntervals,
  subtractIntervals,
} from '../src/pulse/meeting-intervals';
import { EffectiveTimeService } from '../src/pulse/effective-time.service';

const min = (n: number) => n * 60 * 1000;
const svc = new EffectiveTimeService({} as never);

function splitHours(total: number, low: number, idle: number) {
  const result = computeEffectiveTime(total, low, idle);
  expect(result.effective_hours + result.non_effective_hours).toBeCloseTo(result.total_hours, 5);
  return result;
}

describe('non-effective time — Mac and Windows Pulse', () => {
  it('2h Word-during-Meet (Mac tab URL or Windows Meet title) is fully effective', () => {
    expect(
      isVideoMeetingScreenshot('Google Chrome', 'Meet - Daily Sync - Google Chrome'),
    ).toBe(true);
    expect(applyMeetingActivityFloor(0, 'Google Chrome', 'Meet - Daily Sync - Google Chrome')).toBe(
      MEETING_ACTIVITY_FLOOR_PERCENT,
    );

    const result = splitHours(2, 0, 0);
    expect(result.non_effective_hours).toBe(0);
    expect(result.effective_hours).toBe(2);
  });

  it('Windows Zoom desktop + no keys does not become non-effective', () => {
    expect(isVideoMeetingScreenshot('Zoom', 'Zoom Meeting')).toBe(true);
    expect(applyMeetingActivityFloor(2, 'Zoom', 'Zoom Meeting')).toBe(MEETING_ACTIVITY_FLOOR_PERCENT);

    const result = splitHours(2, 0, 0);
    expect(result.non_effective_hours).toBe(0);
  });

  it('idle that sits inside a meeting interval is clipped (Mac or Windows capture)', () => {
    const meetStart = Date.parse('2026-08-26T14:00:00Z');
    const meetings = new Map([
      ['1196', [{ startMs: meetStart, endMs: meetStart + min(120) }]],
    ]);

    const byUser = svc.idleHoursFromIdleLogs(
      [
        {
          user_id: '1196',
          idle_start: '2026-08-26T14:05:00Z',
          idle_end: '2026-08-26T15:55:00Z',
          duration_seconds: 110 * 60,
        },
      ],
      'America/Chicago',
      meetings,
    );

    expect(byUser.get('1196')?.get('2026-08-26') ?? 0).toBe(0);
    expect(splitHours(2, 0, 0).non_effective_hours).toBe(0);
  });

  it('idle after the call (conclusive miss on Mac tabs or Windows CDP/UIA) is non-effective', () => {
    const meetStart = Date.parse('2026-08-26T14:00:00Z');
    const meet = { startMs: meetStart, endMs: meetStart + min(60) };
    const idleAfter = { startMs: meetStart + min(70), endMs: meetStart + min(100) };
    expect(subtractIntervals(idleAfter, [meet])).toEqual([idleAfter]);

    const result = splitHours(2, 0, 0.5);
    expect(result.non_effective_hours).toBe(0.5);
    expect(result.effective_hours).toBe(1.5);
  });

  it('Word screenshots between Meet shots stay inside the meeting block', () => {
    const t0 = Date.parse('2026-08-26T14:00:00Z');
    const ivs = mergeCapturedAtsIntoIntervals([t0, t0 + min(8)], min(1), min(10));
    const leftoverIdle = subtractIntervals(
      { startMs: t0 + min(3), endMs: t0 + min(7) },
      ivs,
    );
    expect(leftoverIdle).toEqual([]);
    expect(isVideoMeetingScreenshot('Microsoft Word', 'Notes.docx')).toBe(false);
  });

  it('low activity without a meeting is non-effective on both platforms', () => {
    expect(applyMeetingActivityFloor(3, 'Microsoft Word', 'Notes.docx')).toBe(3);
    const result = splitHours(2, 0.5, 0);
    expect(result.non_effective_hours).toBe(0.5);
    expect(result.effective_hours).toBe(1.5);
  });
});
