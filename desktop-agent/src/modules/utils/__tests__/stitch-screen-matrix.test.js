/**
 * Multi-monitor stitch matrix — physical panes and desktopCapturer thumbs.
 */

jest.mock('screenshot-desktop', () => {
  const fn = jest.fn();
  fn.listDisplays = jest.fn().mockResolvedValue([]);
  fn.all = jest.fn().mockResolvedValue([]);
  return fn;
});

jest.mock('electron', () => ({
  screen: {
    getAllDisplays: jest.fn(() => []),
    getPrimaryDisplay: jest.fn(() => ({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, scaleFactor: 1 })),
  },
  desktopCapturer: { getSources: jest.fn() },
}));

const sharp = require('sharp');
const { buildCases, MAX_STITCH_EDGE_PX } = require('./stitch-screen-matrix');

describe('stitch screen matrix', () => {
  const cases = buildCases();

  test.each(cases.map((c) => [c.name, c]))('%s', async (_name, c) => {
    const { screen } = require('electron');
    screen.getAllDisplays.mockReturnValue(c.displays);
    screen.getPrimaryDisplay.mockReturnValue(
      c.displays.find((d) => d.id === c.primary) || c.displays[0],
    );

    const { stitchCaptures } = require('../multi-display-screenshot');
    const colors = [
      [220, 40, 40],
      [40, 40, 220],
      [40, 180, 40],
    ];
    const captures = [];
    for (let i = 0; i < c.panes.length; i++) {
      const pane = c.panes[i];
      const [r, g, b] = colors[i % colors.length];
      captures.push({
        id: c.displays[i].id,
        primary: c.displays[i].id === c.primary,
        buffer: await sharp({
          create: { width: pane.w, height: pane.h, channels: 3, background: { r, g, b } },
        })
          .png()
          .toBuffer(),
      });
    }

    const buffer = await stitchCaptures(captures);
    expect(buffer.length).toBeGreaterThan(500);
    const meta = await sharp(buffer).metadata();
    expect(meta.width).toBeGreaterThanOrEqual(64);
    expect(meta.height).toBeGreaterThanOrEqual(64);
    expect(meta.width).toBeLessThanOrEqual(MAX_STITCH_EDGE_PX + 2);
    expect(meta.height).toBeLessThanOrEqual(MAX_STITCH_EDGE_PX + 2);
  });

  test('rejects a single pane', async () => {
    const { stitchCaptures } = require('../multi-display-screenshot');
    const one = await sharp({
      create: { width: 100, height: 80, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();
    await expect(stitchCaptures([{ id: 1, primary: true, buffer: one }])).rejects.toThrow(/at least 2/i);
  });
});
