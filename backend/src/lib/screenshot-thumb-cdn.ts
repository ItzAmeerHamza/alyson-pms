import { createHmac } from 'crypto';

/** Signed thumb URLs stay valid through the next 6-hour boundary. */
export const THUMB_CDN_EXP_WINDOW_SEC = 6 * 60 * 60;

/** Domain + HMAC live here so API Lambda env stays under 4KB. */
export const THUMB_CDN_CONFIG_S3_KEY = 'alyson-td-internal/thumb-cdn.json';

export function isScreenshotThumbKey(key: string | null | undefined): boolean {
  return Boolean(key && key.trim().endsWith('.thumb.jpg'));
}

export function isThumbCdnConfigured(
  domain?: string | null,
  secret?: string | null,
): boolean {
  const d = domain?.trim() ?? '';
  const s = secret?.trim() ?? '';
  return d.length > 0 && s.length >= 32;
}

export function thumbCdnUri(s3Key: string): string {
  return `/${String(s3Key || '').trim().replace(/^\/+/, '')}`;
}

export function roundedThumbExpiryUnix(
  nowSec = Math.floor(Date.now() / 1000),
  windowSec = THUMB_CDN_EXP_WINDOW_SEC,
): number {
  return (Math.floor(nowSec / windowSec) + 1) * windowSec;
}

/** Must match infra/sam/screenshot-thumb-auth.js (exp + uri, HMAC-SHA256 hex). */
export function signThumbCdnHmac(secret: string, exp: number, uri: string): string {
  return createHmac('sha256', secret).update(String(exp) + uri).digest('hex');
}

export function buildThumbCdnUrl(
  domain: string,
  s3Key: string,
  secret: string,
  nowSec?: number,
): string {
  const host = domain.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const uri = thumbCdnUri(s3Key);
  const exp = roundedThumbExpiryUnix(nowSec);
  const sig = signThumbCdnHmac(secret, exp, uri);
  return `https://${host}${uri}?exp=${exp}&sig=${sig}`;
}
