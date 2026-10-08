const {
  SLEEP_GAP_MS,
  isSleepGap,
  sleepSafeEndIso,
  effectiveSessionStart,
  elapsedSecondsExcludingSleep,
  closedBaseAfterSleep,
  resolveClosedBaseForStart,
  excludeOwnSessionFromClosedBase,
  resolveLiveTrackedSeconds,
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

describe('resolveClosedBaseForStart — never flash 00:00:00 on Continue', () => {
  it('keeps a known closed total even when the Start path has no fresh DB auth', () => {
    expect(
      resolveClosedBaseForStart({
        closedBase: 2 * 3600,
        stopFloor: 0,
        lastPainted: 2 * 3600,
        liveElapsed: 0,
        nearWorkDayCap: false,
      }),
    ).toBe(2 * 3600);
  });

  it('uses last painted total when closed base was wrongly dropped to 0', () => {
    expect(
      resolveClosedBaseForStart({
        closedBase: 0,
        stopFloor: 0,
        lastPainted: 90 * 60,
        liveElapsed: 0,
        nearWorkDayCap: false,
      }),
    ).toBe(90 * 60);
  });

  it('uses the Stop-click floor when closed base was cleared', () => {
    expect(
      resolveClosedBaseForStart({
        closedBase: 0,
        stopFloor: 5400,
        lastPainted: 5400,
        liveElapsed: 0,
        nearWorkDayCap: false,
      }),
    ).toBe(5400);
  });

  it('does not double-count live elapsed when re-arming mid-session', () => {
    expect(
      resolveClosedBaseForStart({
        closedBase: 0,
        stopFloor: 0,
        lastPainted: 2 * 3600 + 600,
        liveElapsed: 600,
        nearWorkDayCap: false,
      }),
    ).toBe(2 * 3600);
  });

  it('discards a since-midnight leftover when there is no completed floor', () => {
    expect(
      resolveClosedBaseForStart({
        closedBase: 0,
        stopFloor: 0,
        lastPainted: 3 * 3600,
        liveElapsed: 0,
        nearWorkDayCap: true,
      }),
    ).toBe(0);
  });

  it('keeps a real full-day closed total even when it sits near the work-day cap', () => {
    expect(
      resolveClosedBaseForStart({
        closedBase: 8 * 3600,
        stopFloor: 8 * 3600,
        lastPainted: 8 * 3600,
        liveElapsed: 0,
        nearWorkDayCap: true,
      }),
    ).toBe(8 * 3600);
  });

  it('Hamza 21 Sep 15:25 — Stop floor 5713 must win over stale before-current 711', () => {
    expect(
      resolveClosedBaseForStart({
        closedBase: 711,
        stopFloor: 5713,
        lastPainted: 5722,
        liveElapsed: 0,
        nearWorkDayCap: false,
      }),
    ).toBe(5713);
  });

  it('Start after a 1h break keeps the Stop floor even near the work-day cap', () => {
    expect(
      resolveClosedBaseForStart({
        closedBase: 0,
        stopFloor: 3600,
        lastPainted: 3600,
        liveElapsed: 0,
        nearWorkDayCap: true,
      }),
    ).toBe(3600);
  });
});

describe('recover-after-idle must not double-count (Hamza 29 Sep)', () => {
  const start = '2026-09-29T15:37:43.818Z';
  const idleEnd = '2026-09-29T16:40:46.596Z';
  const finalStop = '2026-09-29T17:51:30.052Z';

  it('strips this session out of closedBase when Start reused the original start', () => {
    expect(
      excludeOwnSessionFromClosedBase({
        closedBase: 3787,
        sessionStart: start,
        lastStopAt: idleEnd,
      }),
    ).toBe(0);
  });

  it('keeps earlier sessions when recovering a later row', () => {
    expect(
      excludeOwnSessionFromClosedBase({
        closedBase: 2 * 3600 + 3787,
        sessionStart: start,
        lastStopAt: idleEnd,
      }),
    ).toBe(2 * 3600 + 5);
  });

  it('does not strip closedBase for a new Start after Stop', () => {
    expect(
      excludeOwnSessionFromClosedBase({
        closedBase: 3787,
        sessionStart: '2026-09-29T16:52:02.000Z',
        lastStopAt: idleEnd,
      }),
    ).toBe(3787);
  });

  it('live clock stays at one wall, not closed + live of the same row', () => {
    const shown = resolveLiveTrackedSeconds({
      closedBase: 3787,
      sessionStart: start,
      lastStopAt: idleEnd,
      nowMs: new Date(finalStop).getTime(),
    });
    expect(shown).toBe(8026);
    expect(shown).not.toBe(3787 + 8026);
  });
});

describe('recover-after-idle must not double-count (Hamza 30 Sep)', () => {
  const start = '2026-09-30T08:48:00.000Z'; // 13:48 PKT
  const idleEnd = '2026-09-30T11:36:00.000Z'; // 16:36 PKT authorized cut
  const now = '2026-09-30T11:56:00.000Z'; // 16:56 PKT
  const idleStopFloor = 10607;
  const ownSession = Math.floor((new Date(idleEnd) - new Date(start)) / 1000);
  const morningClosed = idleStopFloor - ownSession;
  const liveFromStart = Math.floor((new Date(now) - new Date(start)) / 1000);

  it('strips the idle-stopped session out of the Stop floor', () => {
    expect(
      excludeOwnSessionFromClosedBase({
        closedBase: idleStopFloor,
        sessionStart: start,
        lastStopAt: idleEnd,
      }),
    ).toBe(morningClosed);
  });

  it('does not paint 3h as 6h when recover reused the original Start', () => {
    const shown = resolveLiveTrackedSeconds({
      closedBase: idleStopFloor,
      sessionStart: start,
      lastStopAt: idleEnd,
      nowMs: new Date(now).getTime(),
    });
    expect(shown).toBe(morningClosed + liveFromStart);
    expect(shown).toBeLessThan(4 * 3600);
    expect(shown).not.toBe(idleStopFloor + liveFromStart);
  });
});
