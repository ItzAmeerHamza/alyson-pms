export const PULSE_ROSTER_STATUSES = ['active', 'invited', 'inactive'] as const;
export type PulseRosterStatus = (typeof PULSE_ROSTER_STATUSES)[number];

/** Team Management roster: using the app / invite never used / removed. */
export function pulseRosterStatus(row: {
  paused_at?: string | Date | null;
  is_active?: boolean | null;
  signed_in_at?: string | Date | null;
}): PulseRosterStatus {
  if (row.paused_at || row.is_active === false) return 'inactive';
  if (!row.signed_in_at) return 'invited';
  return 'active';
}
