/**
 * Multi-display screenshot helpers
 */

jest.mock('screenshot-desktop', () => {
  const fn = jest.fn();
  fn.listDisplays = jest.fn().mockResolvedValue([{ id: 0, name: 'Built-in', primary: true }]);
  fn.all = jest.fn().mockResolvedValue([]);
  return fn;
});

jest.mock('electron', () => ({
  screen: {
    getAllDisplays: jest.fn(() => [
      { id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 }, size: { width: 1440, height: 900 }, scaleFactor: 2 },
      { id: 2, bounds: { x: 2880, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, scaleFactor: 1 },
    ]),
    getPrimaryDisplay: jest.fn(() => ({
      id: 1,
      bounds: { x: 0, y: 0, width: 1440, height: 900 },
      size: { width: 1440, height: 900 },
      scaleFactor: 2,
    })),
  },
  desktopCapturer: {
    getSources: jest.fn(),
  },
}));

const sharp = require('sharp');

describe('multi-display-screenshot', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('getElectronDisplayCount uses Electron screen API (not system_profiler)', () => {
    const { getElectronDisplayCount } = require('../multi-display-screenshot');
    expect(getElectronDisplayCount()).toBe(2);
  });

  test('desktopCapturer path stitches two screen sources', async () => {
    const { desktopCapturer } = require('electron');
    const makeThumb = async (w, h, r, g, b) => {
      const png = await sharp({
        create: { width: w, height: h, channels: 3, background: { r, g, b } },
      })
        .png()
        .toBuffer();
      return {
        isEmpty: () => false,
        toPNG: () => png,
      };
    };

    desktopCapturer.getSources.mockResolvedValue([
      {
        id: 'screen:0:0',
        display_id: '1',
        name: 'Built-in',
        thumbnail: await makeThumb(200, 100, 255, 0, 0),
      },
      {
        id: 'screen:1:0',
        display_id: '2',
        name: 'External',
        thumbnail: await makeThumb(220, 120, 0, 0, 255),
      },
    ]);

    const { captureViaDesktopCapturerStitched } = require('../multi-display-screenshot');
    const result = await captureViaDesktopCapturerStitched({ width: 400, height: 300 });

    expect(result.success).toBe(true);
    expect(result.displayCount).toBe(2);
    expect(result.method).toMatch(/stitched/);
    expect(result.buffer.length).toBeGreaterThan(1000);

    const meta = await sharp(result.buffer).metadata();
    // Side-by-side or geometry stitch should be wider than a single pane
    expect(meta.width).toBeGreaterThan(200);
  });
});
