const fs = require('fs');
const path = require('path');

jest.mock('fs');

const { resolveExplicitStopEndTime } = require('../session-recovery');

describe('resolveExplicitStopEndTime', () => {
  beforeEach(() => {
    fs.existsSync.mockReturnValue(false);
    fs.readdirSync.mockReturnValue([]);
  });

  it('does not fall through to NOW for an orphan close', () => {
    expect(resolveExplicitStopEndTime(null, { liveStop: false })).toBeNull();
  });

  it('uses caller fallback before NOW', () => {
    expect(resolveExplicitStopEndTime('2026-08-13T16:00:00.000Z')).toBe(
      '2026-08-13T16:00:00.000Z',
    );
  });

  it('allows NOW only for a live Stop click', () => {
    const before = Date.now();
    const iso = resolveExplicitStopEndTime(null, { liveStop: true });
    const after = Date.now();
    const ms = new Date(iso).getTime();
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(after + 50);
  });

  it('prefers a local checkpoint over NOW', () => {
    const checkpointPath = path.join(
      process.env.HOME || '/tmp',
      'Library',
      'Application Support',
      'Alyson Work Time',
      'session-checkpoint.json',
    );
    fs.existsSync.mockImplementation((p) => String(p).includes('session-checkpoint.json'));
    fs.readFileSync.mockImplementation((p) => {
      if (String(p).includes('session-checkpoint.json') || String(p) === checkpointPath) {
        return JSON.stringify({ checkpointAt: '2026-08-13T16:10:00.000Z' });
      }
      throw new Error('unexpected read');
    });
    expect(resolveExplicitStopEndTime(null, { liveStop: true })).toBe(
      '2026-08-13T16:10:00.000Z',
    );
  });

  describe('scoping to the session being closed', () => {
    // A checkpoint/pending record left behind by an earlier session used to be
    // handed to the next one. Its end precedes the new session's start, the
    // server floored it, and a session that never happened appeared in payroll.
    const mockCheckpoint = (payload) => {
      fs.existsSync.mockImplementation((p) => String(p).includes('session-checkpoint.json'));
      fs.readFileSync.mockImplementation(() => JSON.stringify(payload));
    };

    it('ignores a checkpoint belonging to a previous session', () => {
      mockCheckpoint({ timeLogId: 'session-A', checkpointAt: '2026-08-13T16:10:00.000Z' });

      const iso = resolveExplicitStopEndTime(null, {
        liveStop: true,
        timeLogId: 'session-B',
      });

      expect(iso).not.toBe('2026-08-13T16:10:00.000Z');
      expect(new Date(iso).getTime()).toBeGreaterThan(
        new Date('2026-08-13T16:10:00.000Z').getTime(),
      );
    });

    it('uses the checkpoint when it belongs to this session', () => {
      mockCheckpoint({ timeLogId: 'session-A', checkpointAt: '2026-08-13T16:10:00.000Z' });

      expect(
        resolveExplicitStopEndTime(null, { liveStop: true, timeLogId: 'session-A' }),
      ).toBe('2026-08-13T16:10:00.000Z');
    });

    it('reads only this session pending file, not the newest of all', () => {
      fs.existsSync.mockImplementation((p) => {
        const s = String(p);
        return s.includes('pending_sessions') && !s.includes('session-checkpoint.json');
      });
      fs.readdirSync.mockReturnValue(['session-A.json', 'session-B.json']);
      fs.readFileSync.mockImplementation((p) =>
        JSON.stringify(
          String(p).includes('session-B')
            ? { endTime: '2026-08-13T16:30:00.000Z' }
            : { endTime: '2026-08-13T18:00:00.000Z' },
        ),
      );

      expect(
        resolveExplicitStopEndTime(null, { liveStop: true, timeLogId: 'session-B' }),
      ).toBe('2026-08-13T16:30:00.000Z');
    });
  });
});
