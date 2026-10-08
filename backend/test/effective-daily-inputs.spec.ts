import { describe, expect, it } from 'vitest';
import { dailyEffectiveInputsFromHourMaps } from '../src/lib/effective-daily';

describe('dailyEffectiveInputsFromHourMaps', () => {
  it('emits per-day seconds so month cards can accumulate Pulse splits', () => {
    const idle = new Map<string, Map<string, number>>([
      ['1214', new Map([['2026-09-01', 3089 / 3600]])],
    ]);
    const low = new Map<string, Map<string, number>>([
      ['1214', new Map([['2026-09-01', 0]])],
    ]);
    const daily = dailyEffectiveInputsFromHourMaps('1214', idle, low);
    expect(daily['2026-09-01']).toEqual({
      idleSeconds: 3089,
      lowActivitySeconds: 0,
    });
  });
});
