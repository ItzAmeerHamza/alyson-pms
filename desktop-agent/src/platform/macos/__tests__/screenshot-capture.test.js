/**
 * macOS capture must not re-run screencapture -D after an incomplete stitch.
 * That retry is what froze Hanan (user 1203) for hours on a 3440×1964 setup.
 */

jest.mock('../../../system/permissions-check', () => ({
  getPermissionDiagnosticSnapshot: jest.fn(() => ({ screen: 'granted' })),
}));

jest.mock('../../../modules/utils/multi-display-screenshot', () => ({
  captureAllDisplaysStitched: jest.fn(),
  captureViaDesktopCapturerStitched: jest.fn(),
  captureViaMacScreencaptureDashD: jest.fn(),
  stitchCaptures: jest.fn(),
  getPreferredThumbnailSize: jest.fn(() => ({ width: 3440, height: 1964 })),
}));

jest.mock('electron', () => ({
  screen: {
    getAllDisplays: jest.fn(() => [{ id: 1 }, { id: 2 }]),
  },
  systemPreferences: {
    getMediaAccessStatus: jest.fn(() => 'granted'),
  },
}));

describe('macos screenshot-capture', () => {
  test('does not force -D or desktopCapturer retry after a 1-pane fallback', async () => {
    const multi = require('../../../modules/utils/multi-display-screenshot');
    multi.captureAllDisplaysStitched.mockResolvedValue({
      success: true,
      buffer: Buffer.from('fallback-png'),
      method: 'screenshot-desktop-primary-fallback',
      displayCount: 1,
      incompleteMultiDisplay: true,
      expectedDisplayCount: 2,
    });

    const { captureScreenshot } = require('../screenshot-capture');
    const result = await captureScreenshot();

    expect(result.success).toBe(true);
    expect(result.displayCount).toBe(1);
    expect(result.method).toBe('screenshot-desktop-primary-fallback');
    expect(multi.captureViaMacScreencaptureDashD).not.toHaveBeenCalled();
    expect(multi.captureViaDesktopCapturerStitched).not.toHaveBeenCalled();
    expect(multi.stitchCaptures).not.toHaveBeenCalled();
  });
});
