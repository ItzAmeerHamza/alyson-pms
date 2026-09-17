jest.mock('../prepare-screenshot-upload', () => ({
  prepareScreenshotForUpload: jest.fn(async (buffer) => ({
    buffer,
    ext: 'jpg',
    contentType: 'image/jpeg',
    route: 'test',
    resized: false,
  })),
}));

const enqueuePrepared = jest.fn();
const requestFlush = jest.fn();

jest.mock('../offline-screenshot-queue', () => ({
  getOfflineScreenshotQueue: () => ({
    enqueuePrepared,
    requestFlush,
    markSynced: jest.fn(),
    noteFailure: jest.fn(),
  }),
}));

jest.mock(
  'electron',
  () => ({ nativeImage: null }),
  { virtual: true },
);

const screenshotStorage = require('../screenshot-storage');

describe('screenshot capture does not wait on S3', () => {
  beforeEach(() => {
    enqueuePrepared.mockClear();
    requestFlush.mockClear();
  });

  it('returns after local persist and does not await S3', async () => {
    const s3 = jest.spyOn(screenshotStorage, 'uploadScreenshotViaS3Api');
    const result = await screenshotStorage.uploadScreenshotBuffer({
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0, 1, 2, 3]),
      userId: 1196,
      capturedAt: '2026-09-16T10:00:00.000Z',
      screenshotId: 'local-first',
    });

    expect(result).toEqual({ id: 'local-first', queued: true });
    expect(enqueuePrepared).toHaveBeenCalledTimes(1);
    expect(enqueuePrepared.mock.calls[0][0].id).toBe('local-first');
    expect(s3).not.toHaveBeenCalled();
    s3.mockRestore();
  });
});
