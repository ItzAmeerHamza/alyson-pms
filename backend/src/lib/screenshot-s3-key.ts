/** S3 key layout — keep in sync with scripts/screenshots-s3-migrate/migrate.mjs */
export function buildScreenshotS3Key(params: {
  prefix: string;
  capturedAt: string | Date;
  organizationId: string | null;
  userId: string;
  screenshotId: string;
  ext: string;
}): string {
  const prefix = params.prefix.replace(/^\/+|\/+$/g, '');
  const d = new Date(params.capturedAt);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const orgSeg = params.organizationId ? String(params.organizationId) : 'none';
  const ext = params.ext.replace(/^\./, '').toLowerCase();
  return `${prefix}/${y}/${m}/${day}/organization_${orgSeg}/user_${params.userId}/${params.screenshotId}.${ext}`;
}
