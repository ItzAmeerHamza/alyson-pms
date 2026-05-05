/**
 * Aggregate time_logs for the local calendar day.
 * Used by get-today-time-stats IPC and tracking start (cumulative "worked today" UI).
 */

function startOfLocalDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfLocalDayExclusive(d = new Date()) {
  const s = startOfLocalDay(d);
  return new Date(s.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string|null} currentTimeLogId - open row to count as "live" in totalTime only
 * @returns {Promise<{ completedClosedSeconds: number, ongoingCurrentSessionSeconds: number, totalTime: number }>}
 */
async function computeTodayTimeLogSeconds(supabase, userId, currentTimeLogId) {
  if (!supabase || !userId) {
    return { completedClosedSeconds: 0, ongoingCurrentSessionSeconds: 0, totalTime: 0 };
  }

  const startOfDay = startOfLocalDay();
  const endOfDay = endOfLocalDayExclusive();

  const { data: timeLogs, error } = await supabase
    .from('time_logs')
    .select('id, start_time, end_time')
    .eq('user_id', userId)
    .gte('start_time', startOfDay.toISOString())
    .lt('start_time', endOfDay.toISOString())
    .order('start_time', { ascending: false });

  if (error) {
    console.warn('⚠️ [TODAY-TIME-LOG-STATS] Query failed:', error.message);
    return { completedClosedSeconds: 0, ongoingCurrentSessionSeconds: 0, totalTime: 0 };
  }

  let completedClosedSeconds = 0;
  let ongoingCurrentSessionSeconds = 0;
  const now = Date.now();

  for (const log of timeLogs || []) {
    if (log.start_time && log.end_time) {
      const start = new Date(log.start_time).getTime();
      const end = new Date(log.end_time).getTime();
      completedClosedSeconds += Math.max(0, Math.floor((end - start) / 1000));
    } else if (log.start_time && !log.end_time) {
      if (currentTimeLogId && log.id === currentTimeLogId) {
        const start = new Date(log.start_time).getTime();
        ongoingCurrentSessionSeconds += Math.max(0, Math.floor((now - start) / 1000));
      }
    }
  }

  const totalTime = completedClosedSeconds + ongoingCurrentSessionSeconds;
  return { completedClosedSeconds, ongoingCurrentSessionSeconds, totalTime };
}

module.exports = {
  computeTodayTimeLogSeconds,
  startOfLocalDay,
  endOfLocalDayExclusive,
};
