import { describe, expect, it } from 'vitest';
import { pulseRosterStatus } from './roster-status';

describe('pulseRosterStatus', () => {
  it('marks paused people inactive', () => {
    expect(
      pulseRosterStatus({
        paused_at: '2026-09-01T00:00:00.000Z',
        signed_in_at: '2026-08-01T00:00:00.000Z',
      }),
    ).toBe('inactive');
    expect(pulseRosterStatus({ is_active: false, signed_in_at: null })).toBe(
      'inactive',
    );
  });

  it('marks unused invites as invited', () => {
    expect(pulseRosterStatus({ is_active: true, signed_in_at: null })).toBe(
      'invited',
    );
  });

  it('marks signed-in people active', () => {
    expect(
      pulseRosterStatus({
        is_active: true,
        signed_in_at: '2026-09-01T00:00:00.000Z',
      }),
    ).toBe('active');
  });
});
