const { isTransientUploadError } = require('../screenshot-storage');
const fs = require('fs');
const path = require('path');

describe('screenshot upload retry', () => {
  it('retries wake-time timeouts and DNS failures', () => {
    expect(isTransientUploadError('Screenshot upload timed out')).toBe(true);
    expect(isTransientUploadError('fetch failed')).toBe(true);
    expect(isTransientUploadError('S3 not configured (BACKEND_API_URL + INTERNAL_API_KEY)')).toBe(false);
  });

  it('mints one screenshot id and reuses it on retry (same row, not a second low-activity shot)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'screenshot-storage.js'), 'utf8');
    expect(src).toMatch(/const screenshotId = args\?\.screenshotId \|\| crypto\.randomUUID\(\)/);
    expect(src).toMatch(/screenshot_id: screenshotId/);
    expect(src).toMatch(/return uploadScreenshotBuffer\(\{ \.\.\.args, _retried: true, screenshotId \}\)/);
  });
});
