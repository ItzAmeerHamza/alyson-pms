export type LeaveScanPeriodConfig = {
  lookbackDays: number;
  maxMessages: number;
  period: string;
};

const LEAVE_SCAN_PERIOD_MAP: Record<string, { lookbackDays: number; maxMessages: number }> = {
  '7d': { lookbackDays: 7, maxMessages: 80 },
  '30d': { lookbackDays: 30, maxMessages: 200 },
  '60d': { lookbackDays: 60, maxMessages: 250 },
  '90d': { lookbackDays: 90, maxMessages: 300 },
  '6mo': { lookbackDays: 183, maxMessages: 300 },
  '12mo': { lookbackDays: 365, maxMessages: 300 },
  '24mo': { lookbackDays: 730, maxMessages: 300 },
};

/** Gmail lookback + max messages for people-ops inbox scan (manual or scheduled). */
export function resolveLeaveScanPeriod(period?: string): LeaveScanPeriodConfig {
  const p = String(period || '30d').toLowerCase();
  const hit = LEAVE_SCAN_PERIOD_MAP[p] || LEAVE_SCAN_PERIOD_MAP['30d'];
  return { ...hit, period: LEAVE_SCAN_PERIOD_MAP[p] ? p : '30d' };
}
