/**
 * Cleanup Old Screenshots Edge Function
 *
 * Deletes screenshots older than N days from both Supabase Storage
 * and the public.screenshots table. Called by pg_cron via pg_net.
 *
 * Storage objects cannot be deleted via direct SQL (storage.protect_delete
 * trigger blocks it), so this function uses the Storage API.
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const BATCH_SIZE = 200;
const MAX_BATCHES = 25;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const svc = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let retentionDays = 30;
  try {
    const body = await req.json();
    if (body.retention_days && Number.isFinite(body.retention_days)) {
      retentionDays = Math.max(7, body.retention_days);
    }
  } catch {
    // use default
  }

  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
  let totalDeleted = 0;
  let totalStorageDeleted = 0;
  let batches = 0;
  let lastError: string | null = null;

  try {
    // Pre-check: count how many should be deleted
    const { count, error: countErr } = await svc
      .from('screenshots')
      .select('id', { count: 'exact', head: true })
      .lt('captured_at', cutoff)
      .not('file_path', 'is', null);

    const pendingCount = count ?? 0;

    if (countErr) {
      return new Response(
        JSON.stringify({ error: 'count_query_failed', detail: countErr.message, cutoff }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (pendingCount === 0) {
      return new Response(
        JSON.stringify({ success: true, deleted: 0, pending: 0, cutoff, message: 'nothing_to_delete' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    while (batches < MAX_BATCHES) {
      batches++;

      const { data: rows, error: qErr } = await svc
        .from('screenshots')
        .select('id, file_path')
        .lt('captured_at', cutoff)
        .not('file_path', 'is', null)
        .order('captured_at', { ascending: true })
        .limit(BATCH_SIZE);

      if (qErr) {
        lastError = `query: ${qErr.message}`;
        console.error('Query error:', qErr.message);
        break;
      }
      if (!rows || rows.length === 0) break;

      const filePaths = rows.map((r: { file_path: string }) => r.file_path).filter(Boolean);
      const ids = rows.map((r: { id: string }) => r.id);

      if (filePaths.length > 0) {
        const { data: removeData, error: storageErr } = await svc.storage
          .from('screenshots')
          .remove(filePaths);

        if (storageErr) {
          console.error(`Storage remove error (batch ${batches}):`, storageErr.message);
          lastError = `storage: ${storageErr.message}`;
        } else {
          totalStorageDeleted += removeData?.length ?? filePaths.length;
        }
      }

      const { error: delErr, count: delCount } = await svc
        .from('screenshots')
        .delete({ count: 'exact' })
        .in('id', ids);

      if (delErr) {
        lastError = `delete: ${delErr.message}`;
        console.error(`DB delete error (batch ${batches}):`, delErr.message);
        break;
      }

      totalDeleted += delCount ?? rows.length;
    }

    if (totalDeleted > 0) {
      await svc.from('system_logs').insert({
        log_type: 'storage_cleanup',
        message: `Purged ${totalDeleted} screenshots older than ${retentionDays} days`,
        metadata: {
          deleted_count: totalDeleted,
          storage_files_removed: totalStorageDeleted,
          retention_days: retentionDays,
          cutoff,
          batches,
          batch_size: BATCH_SIZE,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        deleted: totalDeleted,
        storage_removed: totalStorageDeleted,
        batches,
        retention_days: retentionDays,
        pending_before: pendingCount,
        cutoff,
        ...(lastError ? { last_error: lastError } : {}),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('Cleanup error:', (err as Error).message);
    return new Response(
      JSON.stringify({ error: (err as Error).message, cutoff }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
