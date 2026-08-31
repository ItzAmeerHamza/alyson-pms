import { describe, expect, it } from 'vitest';
import {
  buildThumbCdnUrl,
  isScreenshotThumbKey,
  isThumbCdnConfigured,
  roundedThumbExpiryUnix,
  signThumbCdnHmac,
  thumbCdnUri,
} from './screenshot-thumb-cdn';

const SECRET = 'a'.repeat(32);
const KEY = 'alyson-td-screenshots/2026/08/27/organization_1/user_12/abc.thumb.jpg';

describe('isScreenshotThumbKey', () => {
  it('accepts sibling thumb keys only', () => {
    expect(isScreenshotThumbKey(KEY)).toBe(true);
    expect(isScreenshotThumbKey(KEY.replace('.thumb.jpg', '.jpg'))).toBe(false);
    expect(isScreenshotThumbKey('')).toBe(false);
  });
});

describe('isThumbCdnConfigured', () => {
  it('requires a domain and a 32+ char secret', () => {
    expect(isThumbCdnConfigured('d111.cloudfront.net', SECRET)).toBe(true);
    expect(isThumbCdnConfigured('', SECRET)).toBe(false);
    expect(isThumbCdnConfigured('d111.cloudfront.net', 'short')).toBe(false);
  });
});

describe('thumb CDN signing', () => {
  it('builds a stable HTTPS URL for the same expiry window', () => {
    const now = 1_777_000_000;
    const exp = roundedThumbExpiryUnix(now);
    const uri = thumbCdnUri(KEY);
    const url = buildThumbCdnUrl('https://d111.cloudfront.net/', KEY, SECRET, now);
    expect(url).toBe(
      `https://d111.cloudfront.net${uri}?exp=${exp}&sig=${signThumbCdnHmac(SECRET, exp, uri)}`,
    );
    expect(buildThumbCdnUrl('d111.cloudfront.net', KEY, SECRET, now)).toBe(url);
  });

  it('changes signature when the path or expiry changes', () => {
    const uri = thumbCdnUri(KEY);
    const a = signThumbCdnHmac(SECRET, 100, uri);
    const b = signThumbCdnHmac(SECRET, 101, uri);
    const c = signThumbCdnHmac(SECRET, 100, uri + 'x');
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
