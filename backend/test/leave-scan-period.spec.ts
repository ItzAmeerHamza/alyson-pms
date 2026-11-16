import { resolveLeaveScanPeriod } from '../src/leave/leave-scan-period';

describe('resolveLeaveScanPeriod', () => {
  it('defaults to 30d', () => {
    expect(resolveLeaveScanPeriod()).toEqual({
      period: '30d',
      lookbackDays: 30,
      maxMessages: 200,
    });
  });

  it('resolves 7d for nightly scheduled scans', () => {
    expect(resolveLeaveScanPeriod('7d').lookbackDays).toBe(7);
    expect(resolveLeaveScanPeriod('7d').maxMessages).toBe(80);
  });
});
