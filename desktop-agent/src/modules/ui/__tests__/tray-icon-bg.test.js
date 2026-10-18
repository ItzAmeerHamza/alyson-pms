'use strict';

jest.mock(
  'electron',
  () => ({
    nativeImage: {
      createFromBuffer(buf, { width, height }) {
        return {
          isEmpty: () => false,
          toBitmap: () => Buffer.from(buf),
          toPNG: () => Buffer.from(buf),
          getSize: () => ({ width, height }),
          resize: ({ width: w, height: h }) => ({
            isEmpty: () => false,
            toBitmap: () => Buffer.from(buf),
            getSize: () => ({ width: w, height: h }),
          }),
        };
      },
    },
  }),
  { virtual: true },
);

const { nativeImage } = require('electron');
const { PLATE_RGB, inRoundedRect, composeTrayIconWithBackground, representationFromImage } = require('../tray-icon-bg');

function solidIcon(size, r, g, b) {
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const idx = i * 4;
    buf[idx] = b;
    buf[idx + 1] = g;
    buf[idx + 2] = r;
    buf[idx + 3] = 255;
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

describe('menu-bar tray icon plate background', () => {
  it('keeps a rounded square fill', () => {
    expect(inRoundedRect(11, 11, 22, 6)).toBe(true);
    expect(inRoundedRect(0, 0, 22, 6)).toBe(false);
    expect(inRoundedRect(0, 11, 22, 6)).toBe(true);
  });

  it('paints the same dark Dock plate behind the mark', () => {
    const source = solidIcon(18, 255, 169, 25);
    const badged = composeTrayIconWithBackground(source, {
      size: 22,
      inset: 2,
      radius: 6,
    });
    const bmp = badged.toBitmap();
    const edge = 11 * 22 * 4;
    expect(bmp[edge]).toBe(PLATE_RGB.b);
    expect(bmp[edge + 1]).toBe(PLATE_RGB.g);
    expect(bmp[edge + 2]).toBe(PLATE_RGB.r);
    expect(bmp[edge + 3]).toBe(255);
    const center = (11 * 22 + 11) * 4;
    expect(bmp[center + 3]).toBe(255);
    expect(bmp[center + 2]).toBeGreaterThan(200);
  });

  it('keeps a wide mark wider than the menu bar height', () => {
    const width = 32;
    const height = 18;
    const buf = Buffer.alloc(width * height * 4, 255);
    const source = nativeImage.createFromBuffer(buf, { width, height });
    const badged = composeTrayIconWithBackground(source, { height: 22, inset: 2, radius: 5 });
    const size = badged.getSize();
    expect(size.height).toBe(22);
    expect(size.width).toBeGreaterThan(size.height);
  });

  it('uses the full pixel buffer for a retina menu-bar image', () => {
    const width = 57;
    const height = 36;
    const buf = Buffer.alloc(width * height * 4, 255);
    const source = nativeImage.createFromBuffer(buf, { width: 28, height: 18 });
    source.toBitmap = () => buf;
    const rep = representationFromImage(source, 2);
    expect(rep.scaleFactor).toBe(2);
    expect(rep.width).toBe(57);
    expect(rep.height).toBe(36);
    expect(rep.buffer.length).toBe(width * height * 4);
  });

  it('fills the corners on a square plate so Windows does not paint them black', () => {
    const source = solidIcon(18, 127, 142, 255);
    const badged = composeTrayIconWithBackground(source, {
      size: 22,
      inset: 2,
      radius: 0,
    });
    const bmp = badged.toBitmap();
    expect(bmp[0]).toBe(PLATE_RGB.b);
    expect(bmp[3]).toBe(255);
    const last = (22 * 22 - 1) * 4;
    expect(bmp[last]).toBe(PLATE_RGB.b);
    expect(bmp[last + 3]).toBe(255);
  });
});
