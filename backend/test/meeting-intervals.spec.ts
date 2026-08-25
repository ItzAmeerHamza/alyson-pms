import { describe, expect, it } from 'vitest';
import {
  intervalContains,
  intervalOverlapMs,
  mergeCapturedAtsIntoIntervals,
  subtractIntervals,
} from '../src/pulse/meeting-intervals';

const min = (n: number) => n * 60 * 1000;

describe('meeting intervals', () => {
  it('merges Meet shots a few minutes apart (tab switch) into one call', () => {
    const t0 = Date.parse('2026-08-25T12:20:00Z');
    const shots = [t0, t0 + min(1), t0 + min(8), t0 + min(9)];
    const ivs = mergeCapturedAtsIntoIntervals(shots, min(1), min(10));
    expect(ivs).toHaveLength(1);
    expect(ivs[0].startMs).toBe(t0);
    expect(ivs[0].endMs).toBe(t0 + min(9) + min(1) + min(10));
  });

  it('keeps the minutes after the last Meet shot in-meeting so Pulse does not see-saw', () => {
    const t0 = Date.parse('2026-08-25T12:20:00Z');
    const ivs = mergeCapturedAtsIntoIntervals([t0], min(1), min(10));
    expect(intervalContains(t0 + min(5), ivs)).toBe(true);
    expect(intervalContains(t0 + min(15), ivs)).toBe(false);
  });

  it('does not join two calls an hour apart', () => {
    const t0 = Date.parse('2026-08-25T12:00:00Z');
    const ivs = mergeCapturedAtsIntoIntervals([t0, t0 + min(70)], min(1), min(10));
    expect(ivs).toHaveLength(2);
  });

  it('subtracts a 1-hour meeting from idle so that hour is not non-effective', () => {
    const meetStart = Date.parse('2026-08-25T12:00:00Z');
    const meet = { startMs: meetStart, endMs: meetStart + min(60) };
    const idle = { startMs: meetStart + min(10), endMs: meetStart + min(50) };
    const leftover = subtractIntervals(idle, [meet]);
    expect(leftover).toEqual([]);
    expect(intervalOverlapMs(idle, meet)).toBe(min(40));
  });

  it('keeps idle that sits outside the meeting', () => {
    const meetStart = Date.parse('2026-08-25T12:00:00Z');
    const meet = { startMs: meetStart, endMs: meetStart + min(60) };
    const idle = { startMs: meetStart + min(90), endMs: meetStart + min(100) };
    const leftover = subtractIntervals(idle, [meet]);
    expect(leftover).toEqual([idle]);
  });

  it('marks Signal/docs shots inside a Meet block as in-meeting', () => {
    const t0 = Date.parse('2026-08-25T12:20:00Z');
    const ivs = mergeCapturedAtsIntoIntervals([t0, t0 + min(8)], min(1), min(10));
    expect(intervalContains(t0 + min(5), ivs)).toBe(true);
  });
});
