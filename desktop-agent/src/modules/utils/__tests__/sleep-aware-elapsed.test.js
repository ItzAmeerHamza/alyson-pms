const {
  SLEEP_GAP_MS,
  isSleepGap,
  sleepSafeEndIso,
  effectiveSessionStart,
  elapsedSecondsExcludingSleep,
  closedBaseAfterSleep,
  isPhantomStoppedTotal,
} = require('../sleep-aware-elapsed');

describe('sleep-aware elapsed (lid down must not count)', () => {
  const start = '2026-08-24T17:31:55.890Z'; // 12:31 CDT
  const lastAlive = '2026-08-24T18:24:54.783Z'; // 13:24 CDT — lid down
  const wake = '2026-08-24T19:24:54.136Z'; // 14:24 CDT — Windows delivers suspend+resume

  it('treats a 60s+ proof gap as sleep', () => {
    const now = new Date(lastAlive).getTime() + SLEEP_GAP_MS + 1;
    expect(isSleepGap(lastAlive, now)).toBe(true);
    expect(isSleepGap(lastAlive, new Date(lastAlive).getTime() + 10_000)).toBe(false);
  });

  it('sleep-stop uses last checkpoint after a freeze, not wake NOW', () => {
    expect(
      sleepSafeEndIso({
        lastCheckpointAt: lastAlive,
        checkpointTimeLogId: '93b19aac',
        timeLogId: '93b19aac',
        nowIso: wake,
      }),
    ).toBe(new Date(lastAlive).toISOString());
  });

  it('sleep-stop uses NOW when the checkpoint is still live (real-time lid close)', () => {
    const now = '2026-08-24T18:25:01.942Z';
    expect(
      sleepSafeEndIso({
        lastCheckpointAt: '2026-08-24T18:24:54.783Z',
        checkpointTimeLogId: '93b19aac',
        timeLogId: '93b19aac',
        nowIso: now,
      }),
    ).toBe(now);
  });

  it('does not use another session\'s checkpoint as this session\'s end', () => {
    const now = wake;
    expect(
      sleepSafeEndIso({
        lastCheckpointAt: lastAlive,
        checkpointTimeLogId: 'old-session',
        timeLogId: '93b19aac',
        nowIso: now,
      }),
    ).toBe(now);
  });

  it('clock after wake is time since wake, not since the pre-sleep Start', () => {
    const wakeMs = new Date(wake).getTime();
    const nowMs = wakeMs + 45 * 1000;
    const wall = Math.floor((nowMs - new Date(start).getTime()) / 1000);
    const billed = elapsedSecondsExcludingSleep(start, nowMs, wakeMs);
    expect(wall).toBeGreaterThan(1.8 * 3600); // ~1h 53m wall (includes lid-down)
    expect(billed).toBe(45);
  });

  it('effective start stays the real Start when there was no wake clamp', () => {
    expect(effectiveSessionStart(start, 0)).toBe(start);
  });

  it('post-sleep closed base ignores leftover high-water (6:28 + 1:53 = 8:21)', () => {
    expect(closedBaseAfterSleep(17718)).toBe(17718); // sessions 1+2 only
    expect(closedBaseAfterSleep(null)).toBe(0);
  });

  describe('Windows delayed suspend+resume vs Mac live suspend', () => {
    it('Windows: suspend fires at wake — end is last heartbeat, clock is time since wake', () => {
      // Garima: lid 13:24, both events at 14:24. Wall clock 1h53 would overcount.
      const end = sleepSafeEndIso({
        lastCheckpointAt: lastAlive,
        checkpointTimeLogId: '93b19aac',
        timeLogId: '93b19aac',
        nowIso: wake,
      });
      expect(end).toBe(new Date(lastAlive).toISOString());

      const wakeMs = new Date(wake).getTime();
      expect(elapsedSecondsExcludingSleep(start, wakeMs + 120_000, wakeMs)).toBe(120);
    });

    it('Mac: suspend fires while going to sleep — end is NOW (seconds after last checkpoint)', () => {
      const macNow = '2026-08-24T18:25:01.942Z';
      expect(
        sleepSafeEndIso({
          lastCheckpointAt: lastAlive,
          checkpointTimeLogId: '93b19aac',
          timeLogId: '93b19aac',
          nowIso: macNow,
        }),
      ).toBe(macNow);
    });

    it('stopped overnight: 3h leftover vs empty DB is phantom (Month blink / Start seed)', () => {
      expect(isPhantomStoppedTotal(3 * 3600 + 120, 0, true)).toBe(true);
      expect(isPhantomStoppedTotal(4 * 60, 0, false)).toBe(false);
      expect(isPhantomStoppedTotal(4 * 60, 4 * 60, true)).toBe(false);
    });

    it('both: after wake the painted clock never includes the lid-down hour', () => {
      const wakeMs = new Date(wake).getTime();
      const oneHourAfterWake = wakeMs + 3600_000;
      const billed = elapsedSecondsExcludingSleep(start, oneHourAfterWake, wakeMs);
      const wallIncludingSleep = Math.floor((oneHourAfterWake - new Date(start).getTime()) / 1000);
      expect(billed).toBe(3600);
      expect(wallIncludingSleep).toBeGreaterThan(2.8 * 3600);
    });
  });
});
