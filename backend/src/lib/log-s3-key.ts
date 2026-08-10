/** S3 key layout for desktop-agent diagnostic logs (Athena-friendly Hive partitions). */
export function buildLogS3Key(params: {
  workspaceId: string | number | null;
  userId: string | number;
  deviceId: string | null;
  agentVersion: string | null;
  logDate: string; // YYYY-MM-DD (UTC calendar day from the desktop agent)
}): string {
  const wsSeg = params.workspaceId != null ? String(params.workspaceId) : 'none';
  const deviceSeg = (params.deviceId || 'unknown-device').replace(/[^a-zA-Z0-9_-]/g, '');
  const versionSeg = (params.agentVersion || 'unknown-version').replace(/[^a-zA-Z0-9_.-]/g, '');
  const dateSeg = /^\d{4}-\d{2}-\d{2}$/.test(params.logDate) ? params.logDate : 'unknown-date';
  // Hive-style partitions for Athena prune by day / workspace / user / device.
  return `logs/dt=${dateSeg}/workspace_id=${wsSeg}/user_id=${params.userId}/device_id=${deviceSeg}/${versionSeg}.jsonl`;
}
