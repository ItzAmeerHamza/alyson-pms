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
const { inRoundedRect, composeTrayIconWithWhiteBackground } = require('../tray-icon-bg');

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

describe('menu-bar tray icon white background', () => {
  it('keeps a rounded square fill', () => {
    expect(inRoundedRect(11, 11, 22, 6)).toBe(true);
    expect(inRoundedRect(0, 0, 22, 6)).toBe(false);
    expect(inRoundedRect(0, 11, 22, 6)).toBe(true);
  });

  it('paints a white pad behind the mark', () => {
    const source = solidIcon(18, 255, 169, 25);
    const badged = composeTrayIconWithWhiteBackground(source, {
      size: 22,
      inset: 2,
      radius: 6,
    });
    const bmp = badged.toBitmap();
    const edge = 11 * 22 * 4;
    expect(bmp[edge]).toBe(255);
    expect(bmp[edge + 1]).toBe(255);
    expect(bmp[edge + 2]).toBe(255);
    expect(bmp[edge + 3]).toBe(255);
    const center = (11 * 22 + 11) * 4;
    expect(bmp[center + 3]).toBe(255);
    expect(bmp[center + 2]).toBeGreaterThan(200);
  });
});
