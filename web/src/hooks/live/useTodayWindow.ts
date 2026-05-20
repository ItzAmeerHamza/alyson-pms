import { useMemo } from "react";

export function useTodayWindow() {
  return useMemo(() => {
    const now = new Date();
    // Use UTC dates to match database timestamps
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const to = now;
    const result = { fromISO: from.toISOString(), toISO: to.toISOString(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
    console.log('🔍 [DEBUG] Today window calculated:', {
      localNow: now.toString(),
      utcFrom: from.toISOString(),
      utcTo: to.toISOString(),
      result
    });
    return result;
  }, []);
}

export type TodayWindow = ReturnType<typeof useTodayWindow>;


