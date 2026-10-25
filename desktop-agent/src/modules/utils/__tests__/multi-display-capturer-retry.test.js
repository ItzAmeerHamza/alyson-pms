/**
 * desktopCapturer size ladder: only retry smaller sizes when the OS returned
 * >= 2 screens; single-screen results stay the same (final-size) image.
 */

jest.mock('screenshot-desktop', () => {
  const fn = jest.fn();
  fn.listDisplays = jest.fn().mockResolvedValue([]);
  fn.all = jest.fn().mockResolvedValue([]);
  return fn;
});

jest.mock('electron', () => ({
  screen: {
    getAllDisplays: jest.fn(() => [
      { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, scaleFactor: 1 },
    ]),
  },
  desktopCapturer: { getSources: jest.fn() },
}));

function src(id, png, empty = false) {
  return { id, display_id: id, thumbnail: { isEmpty: () => empty, toPNG: () => png } };
}

describe('captureViaDesktopCapturerStitched retry ladder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('single OS source: skips the intermediate size, returns final-size image', async () => {
    const { desktopCapturer } = require('electron');
    desktopCapturer.getSources.mockImplementation(async ({ thumbnailSize }) => [
      src('1', Buffer.from(`png-${thumbnailSize.width}x${thumbnailSize.height}`)),
    ]);
    const { captureViaDesktopCapturerStitched } = require('../multi-display-screenshot');
    const res = await captureViaDesktopCapturerStitched({ width: 1920, height: 1080 });

    const sizes = desktopCapturer.getSources.mock.calls.map((c) => c[0].thumbnailSize);
    expect(sizes).toEqual([{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]);
    expect(res).toEqual({
      success: true,
      buffer: Buffer.from('png-1280x720'),
      method: 'desktopCapturer',
      displayCount: 1,
    });
  });

  test('two OS sources but one usable image: still walks the full ladder', async () => {
    const { desktopCapturer } = require('electron');
    desktopCapturer.getSources.mockImplementation(async () => [
      src('1', Buffer.from('a')),
      src('2', Buffer.alloc(0), true),
    ]);
    const { captureViaDesktopCapturerStitched } = require('../multi-display-screenshot');
    const res = await captureViaDesktopCapturerStitched({ width: 1920, height: 1080 });
    expect(desktopCapturer.getSources).toHaveBeenCalledTimes(3);
    expect(res.displayCount).toBe(1);
  });

  test('zero sources: throws the same error after the final size', async () => {
    const { desktopCapturer } = require('electron');
    desktopCapturer.getSources.mockResolvedValue([]);
    const { captureViaDesktopCapturerStitched } = require('../multi-display-screenshot');
    await expect(captureViaDesktopCapturerStitched({ width: 1920, height: 1080 })).rejects.toThrow(
      'No screen sources available',
    );
    expect(desktopCapturer.getSources).toHaveBeenCalledTimes(2);
  });
});
