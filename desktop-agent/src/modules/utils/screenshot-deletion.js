const { resolveSupabaseClient } = require('./session-recovery');
const { createFeatureLogger } = require('./logger');

const log = createFeatureLogger('SCREEN', { adapter: 'deletion' });

const MAX_DEDUCTION_SECONDS = 240; // 4 minutes cap per screenshot

/**
 * Calculate time deduction for a screenshot using the midpoint algorithm.
 * Each screenshot "owns" the interval from midpoint(prev, this) to midpoint(this, next).
 */
function calculateDeductionSeconds({ targetCapturedAt, prevCapturedAt, nextCapturedAt, sessionStart, sessionEnd }) {
  const target = new Date(targetCapturedAt).getTime();
  const start = new Date(sessionStart).getTime();
  const end = sessionEnd ? new Date(sessionEnd).getTime() : Date.now();

  let intervalStart = prevCapturedAt
    ? (new Date(prevCapturedAt).getTime() + target) / 2
    : start;

  let intervalEnd = nextCapturedAt
    ? (target + new Date(nextCapturedAt).getTime()) / 2
    : end;

  // Clamp to session bounds: screenshots may exist outside the time log window
  intervalStart = Math.max(intervalStart, start);
  intervalEnd = Math.min(intervalEnd, Math.max(end, target + 60000));

  // If target is outside the session window entirely, use a sensible default
  if (intervalEnd <= intervalStart) {
    return Math.min(200, MAX_DEDUCTION_SECONDS);
  }

  const rawSeconds = Math.max(0, Math.round((intervalEnd - intervalStart) / 1000));
  return Math.min(rawSeconds, MAX_DEDUCTION_SECONDS);
}

/**
 * Estimate time deduction for a screenshot without deleting it.
 * Returns { deductedSeconds, screenshotInfo }.
 */
async function estimateDeduction({ screenshotId, supabase }) {
  const client = supabase || resolveSupabaseClient();
  if (!client) throw new Error('Supabase client not available');

  const { data: screenshot, error: ssErr } = await client
    .from('screenshots')
    .select('id, user_id, time_log_id, captured_at, image_url, file_path')
    .eq('id', screenshotId)
    .single();

  if (ssErr || !screenshot) throw new Error(ssErr?.message || 'Screenshot not found');

  const deductedSeconds = await computeDeduction(client, screenshot);
  return { deductedSeconds, screenshot };
}

/**
 * Delete a screenshot and record the time deduction.
 * 1. Fetch screenshot + neighbors
 * 2. Calculate deduction
 * 3. Delete from storage
 * 4. Insert audit record
 * 5. Increment time_logs.deducted_seconds
 * 6. Delete screenshot row
 */
async function deleteScreenshotWithDeduction({ screenshotId, deletedBy, deletionSource, supabase }) {
  const client = supabase || resolveSupabaseClient();
  if (!client) throw new Error('Supabase client not available');

  const { data: screenshot, error: ssErr } = await client
    .from('screenshots')
    .select('id, user_id, time_log_id, captured_at, image_url, file_path, organization_id')
    .eq('id', screenshotId)
    .single();

  if (ssErr || !screenshot) throw new Error(ssErr?.message || 'Screenshot not found');

  const deductedSeconds = await computeDeduction(client, screenshot);

  // Delete from Supabase Storage
  if (screenshot.file_path) {
    try {
      await client.storage.from('screenshots').remove([screenshot.file_path]);
      log.info({ step: 'STORAGE_DELETED', ctx: { file: screenshot.file_path } });
    } catch (storageErr) {
      log.warn({ step: 'STORAGE_DELETE_FAILED', message: storageErr.message });
    }
  }

  // Insert audit record
  const { error: auditErr } = await client
    .from('screenshot_deletions')
    .insert({
      screenshot_id: screenshot.id,
      user_id: screenshot.user_id,
      time_log_id: screenshot.time_log_id,
      organization_id: screenshot.organization_id || null,
      deleted_by: deletedBy,
      deducted_seconds: deductedSeconds,
      screenshot_captured_at: screenshot.captured_at,
      image_url: screenshot.image_url,
      deletion_source: deletionSource
    });

  if (auditErr) {
    log.warn({ step: 'AUDIT_INSERT_FAILED', message: auditErr.message });
  }

  // Increment deducted_seconds on time_log
  if (screenshot.time_log_id && deductedSeconds > 0) {
    const { data: timeLog } = await client
      .from('time_logs')
      .select('deducted_seconds')
      .eq('id', screenshot.time_log_id)
      .single();

    const currentDeducted = timeLog?.deducted_seconds || 0;
    const { error: updateErr } = await client
      .from('time_logs')
      .update({ deducted_seconds: currentDeducted + deductedSeconds })
      .eq('id', screenshot.time_log_id);

    if (updateErr) {
      log.error({ step: 'TIME_LOG_UPDATE_FAILED', message: updateErr.message });
    }
  }

  // Delete screenshot row
  const { error: delErr } = await client
    .from('screenshots')
    .delete()
    .eq('id', screenshotId);

  if (delErr) throw new Error(`Failed to delete screenshot: ${delErr.message}`);

  log.info({
    step: 'SCREENSHOT_DELETED',
    ctx: { screenshotId, deductedSeconds, timeLogId: screenshot.time_log_id }
  });

  return { success: true, deductedSeconds, timeLogId: screenshot.time_log_id };
}

/**
 * Compute deduction by fetching neighbors and the parent time log.
 */
async function computeDeduction(client, screenshot) {
  if (!screenshot.time_log_id) {
    log.info({ step: 'COMPUTE_DEDUCTION', message: 'No time_log_id, using fallback 200s' });
    return Math.min(200, MAX_DEDUCTION_SECONDS);
  }

  const { data: timeLog, error: tlErr } = await client
    .from('time_logs')
    .select('start_time, end_time')
    .eq('id', screenshot.time_log_id)
    .single();

  if (tlErr || !timeLog) {
    log.info({ step: 'COMPUTE_DEDUCTION', message: 'Time log not found, using fallback 200s', ctx: { err: tlErr?.message } });
    return Math.min(200, MAX_DEDUCTION_SECONDS);
  }

  const { data: neighbors, error: nErr } = await client
    .from('screenshots')
    .select('captured_at')
    .eq('time_log_id', screenshot.time_log_id)
    .neq('id', screenshot.id)
    .order('captured_at', { ascending: true });

  const capturedMs = new Date(screenshot.captured_at).getTime();
  let prevCapturedAt = null;
  let nextCapturedAt = null;

  if (neighbors && neighbors.length > 0) {
    const before = neighbors.filter(n => new Date(n.captured_at).getTime() < capturedMs);
    const after = neighbors.filter(n => new Date(n.captured_at).getTime() > capturedMs);
    if (before.length > 0) prevCapturedAt = before[before.length - 1].captured_at;
    if (after.length > 0) nextCapturedAt = after[0].captured_at;
  }

  const params = {
    targetCapturedAt: screenshot.captured_at,
    prevCapturedAt,
    nextCapturedAt,
    sessionStart: timeLog.start_time,
    sessionEnd: timeLog.end_time
  };

  const result = calculateDeductionSeconds(params);
  log.info({
    step: 'COMPUTE_DEDUCTION',
    ctx: {
      time_log_id: screenshot.time_log_id,
      neighbors: neighbors?.length || 0,
      prevCapturedAt,
      nextCapturedAt,
      sessionStart: timeLog.start_time,
      sessionEnd: timeLog.end_time,
      result
    }
  });

  return result;
}

module.exports = {
  calculateDeductionSeconds,
  estimateDeduction,
  deleteScreenshotWithDeduction,
  MAX_DEDUCTION_SECONDS
};
