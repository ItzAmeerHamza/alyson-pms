import { describe, expect, it } from 'vitest';
import {
  lowActivityCapMs,
  screenshotOwnedRangeMs,
  screenshotOwnedSeconds,
} from './screenshot-owned-interval';

const T = (iso: string) => Date.parse(iso);

describe('screenshotOwnedSeconds', () => {
  it('credits the real gap between random neighbors, not a flat interval', () => {
    const cap = lowActivityCapMs(5);
    const close = screenshotOwnedSeconds(
      T('2026-09-01T10:00:00.000Z'),
      T('2026-09-01T10:01:30.000Z'),
      T('2026-09-01T10:03:00.000Z'),
      cap,
    );
    const wide = screenshotOwnedSeconds(
      T('2026-09-01T10:00:00.000Z'),
      T('2026-09-01T10:04:00.000Z'),
      T('2026-09-01T10:10:00.000Z'),
      cap,
    );
    expect(close).toBe(90);
    expect(wide).toBe(300);
    expect(wide).toBeGreaterThan(close);
  });

  it('caps a lonely shot at the derived average gap', () => {
    const cap = lowActivityCapMs(5);
    expect(screenshotOwnedSeconds(null, T('2026-09-01T10:00:00.000Z'), null, cap)).toBe(300);
  });

  it('keeps 1-minute neighbors at one minute', () => {
    const cap = lowActivityCapMs(1);
    expect(
      screenshotOwnedSeconds(
        T('2026-09-01T10:00:00.000Z'),
        T('2026-09-01T10:01:00.000Z'),
        T('2026-09-01T10:02:00.000Z'),
        cap,
      ),
    ).toBe(60);
  });

  it('clamps each side so one shot cannot own more than the cap', () => {
    const { startMs, endMs } = screenshotOwnedRangeMs(
      T('2026-09-01T09:00:00.000Z'),
      T('2026-09-01T10:00:00.000Z'),
      T('2026-09-01T11:00:00.000Z'),
      lowActivityCapMs(5),
    );
    expect((endMs - startMs) / 1000).toBe(300);
  });
});
