const sharp = require('sharp');
const {
  shouldResizeLongestEdge,
  prepareScreenshotForUpload,
  RESIZE_IF_LONGER_THAN_PX,
  TARGET_LONG_EDGE_PX,
} = require('../prepare-screenshot-upload');

async function solidJpeg({ width, height }) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 40, g: 80, b: 160 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe('shouldResizeLongestEdge', () => {
  it('resizes only when the longest edge is above 2560', () => {
    expect(RESIZE_IF_LONGER_THAN_PX).toBe(2560);
    expect(TARGET_LONG_EDGE_PX).toBe(1920);
    expect(shouldResizeLongestEdge(2560, 1440)).toBe(false);
    expect(shouldResizeLongestEdge(2561, 1440)).toBe(true);
    expect(shouldResizeLongestEdge(1920, 1080)).toBe(false);
    expect(shouldResizeLongestEdge(0, 4000)).toBe(false);
  });
});

describe('prepareScreenshotForUpload', () => {
  it('does not shrink a 1920-wide capture', async () => {
    const source = await solidJpeg({ width: 1920, height: 1080 });
    const prepared = await prepareScreenshotForUpload(source);
    expect(prepared.ext).toBe('jpg');
    expect(prepared.resized).toBe(false);
    const meta = await sharp(prepared.buffer).metadata();
    expect(meta.width).toBe(1920);
    expect(meta.height).toBe(1080);
    expect(prepared.buffer.length).toBeGreaterThan(200);
  });

  it('caps a 3840-wide stitch to 1920 on the long edge', async () => {
    const source = await solidJpeg({ width: 3840, height: 1080 });
    const prepared = await prepareScreenshotForUpload(source);
    expect(prepared.resized).toBe(true);
    const meta = await sharp(prepared.buffer).metadata();
    expect(meta.width).toBe(TARGET_LONG_EDGE_PX);
    expect(meta.height).toBe(540);
    expect(prepared.buffer[0]).toBe(0xff);
    expect(prepared.buffer[1]).toBe(0xd8);
  });

  it('keeps the original buffer when encode cannot produce a visible image', async () => {
    const junk = Buffer.alloc(400, 7);
    const prepared = await prepareScreenshotForUpload(junk);
    expect(prepared.route).toBe('original');
    expect(prepared.buffer.equals(junk)).toBe(true);
  });
});
