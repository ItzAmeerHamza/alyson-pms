'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const assets = path.join(__dirname, '../../assets');

function icoPng(size) {
  const buf = fs.readFileSync(path.join(assets, 'icon.ico'));
  const count = buf.readUInt16LE(4);
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16;
    const width = buf.readUInt8(entry) || 256;
    const length = buf.readUInt32LE(entry + 8);
    const offset = buf.readUInt32LE(entry + 12);
    if (width === size) return buf.subarray(offset, offset + length);
  }
  throw new Error(`icon.ico has no ${size}px frame`);
}

describe('Windows and Mac app icons', () => {
  it('uses the same rounded Dock tile in icon.ico and icon.png', async () => {
    const frame = await sharp(icoPng(256)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const mac = await sharp(path.join(assets, 'icon.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(frame.info.width).toBe(256);
    expect(frame.data[3]).toBe(0);
    expect(mac.data[3]).toBe(0);
    const plate = (128 * 256 + 40) * 4;
    const macPlate = (512 * 1024 + 160) * 4;
    for (const [buf, at] of [[frame.data, plate], [mac.data, macPlate]]) {
      expect(buf[at]).toBeGreaterThan(10);
      expect(buf[at]).toBeLessThan(40);
      expect(buf[at + 3]).toBe(255);
    }
  });
});
