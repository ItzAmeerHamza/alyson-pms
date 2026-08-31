const { isTransientUploadError } = require('../screenshot-storage');

describe('screenshot upload retry', () => {
  it('retries wake-time timeouts and DNS failures', () => {
    expect(isTransientUploadError('Screenshot upload timed out')).toBe(true);
    expect(isTransientUploadError('fetch failed')).toBe(true);
    expect(isTransientUploadError('S3 not configured (BACKEND_API_URL + INTERNAL_API_KEY)')).toBe(false);
  });
});
