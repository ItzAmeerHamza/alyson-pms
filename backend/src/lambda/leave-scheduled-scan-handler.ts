import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import type { Handler } from 'aws-lambda';
import { resolveLeaveScanPeriod } from '../leave/leave-scan-period';
import type { LeaveScanJob } from '../leave/leave-scan.types';
import type { ScopedAuthUser } from '../database/time-doctor-sql';

function parseWorkspaceIds(raw: string | undefined): number[] {
  return String(raw || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function scheduledScanActor(workspaceId: number, actorUserId: number): ScopedAuthUser {
  return {
    id: String(actorUserId),
    role: 'admin',
    organization_id: String(workspaceId),
    is_super_admin: false,
  };
}

/**
 * EventBridge: nightly people-ops Gmail scan → ingest-batch → leave credits / holiday hours.
 * Same pipeline as POST /pulse/leave/scan (async leave-scan worker).
 */
export const handler: Handler = async () => {
  const functionName = (process.env.LEAVE_SCAN_FUNCTION_NAME || '').trim();
  const workspaceIds = parseWorkspaceIds(process.env.LEAVE_SCHEDULED_WORKSPACE_IDS);
  const actorUserId = Number(process.env.LEAVE_SCHEDULED_SCAN_ACTOR_USER_ID || '');
  const period = (process.env.LEAVE_SCHEDULED_SCAN_PERIOD || '7d').trim();
  const periodCfg = resolveLeaveScanPeriod(period);

  if (!functionName) {
    console.warn('Leave scheduled scan skipped: LEAVE_SCAN_FUNCTION_NAME not set');
    return { ok: true, skipped: true, reason: 'missing_function' };
  }
  if (!workspaceIds.length) {
    console.warn('Leave scheduled scan skipped: LEAVE_SCHEDULED_WORKSPACE_IDS empty');
    return { ok: true, skipped: true, reason: 'missing_workspaces' };
  }
  if (!Number.isFinite(actorUserId) || actorUserId <= 0) {
    console.error(
      'Leave scheduled scan aborted: LEAVE_SCHEDULED_SCAN_ACTOR_USER_ID must be a tenant user id',
    );
    return { ok: false, skipped: true, reason: 'missing_actor' };
  }

  const region = process.env.AWS_REGION || 'us-west-2';
  const endpoint = (process.env.LAMBDA_VPC_ENDPOINT_URL || '').trim();
  const lambda = new LambdaClient({
    region,
    ...(endpoint ? { endpoint } : {}),
  });

  const started: number[] = [];
  const errors: { workspaceId: number; error: string }[] = [];

  for (const workspaceId of workspaceIds) {
    const job: LeaveScanJob = {
      workspaceId,
      actor: scheduledScanActor(workspaceId, actorUserId),
      period: periodCfg.period,
      lookbackDays: periodCfg.lookbackDays,
      maxMessages: periodCfg.maxMessages,
    };
    try {
      await lambda.send(
        new InvokeCommand({
          FunctionName: functionName,
          InvocationType: 'Event',
          Payload: Buffer.from(JSON.stringify(job)),
        }),
      );
      started.push(workspaceId);
      console.log(
        `Leave scheduled scan enqueued workspace=${workspaceId} period=${periodCfg.period} lookback=${periodCfg.lookbackDays}d`,
      );
    } catch (err) {
      const msg = String(err);
      errors.push({ workspaceId, error: msg.slice(0, 400) });
      console.error(`Leave scheduled scan invoke failed workspace=${workspaceId}: ${msg}`);
    }
  }

  return {
    ok: errors.length === 0,
    period: periodCfg.period,
    lookback_days: periodCfg.lookbackDays,
    started,
    errors,
  };
};
