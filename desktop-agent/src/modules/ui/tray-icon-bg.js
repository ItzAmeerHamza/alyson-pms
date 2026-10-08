'use strict';

const { nativeImage } = require('electron');

function inRoundedRect(x, y, size, radius) {
  const r = Math.max(0, Math.min(Math.floor(radius), Math.floor(size / 2)));
  if (x >= r && x < size - r) return y >= 0 && y < size;
  if (y >= r && y < size - r) return x >= 0 && x < size;
  const cx = x < r ? r : size - 1 - r;
  const cy = y < r ? r : size - 1 - r;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Sit the Tavilo mark on a white rounded square so the menu-bar icon
 * stays readable on both light and dark macOS bars.
 */
function composeTrayIconWithWhiteBackground(source, { size = 22, inset = 2, radius = 6 } = {}) {
  if (!source || typeof source.isEmpty === 'function' && source.isEmpty()) return null;
  const canvas = Math.max(16, Math.floor(Number(size) || 22));
  const pad = Math.max(1, Math.floor(Number(inset) || 2));
  const logoSize = Math.max(8, canvas - pad * 2);
  const logo = source.resize({ width: logoSize, height: logoSize });
  const logoBmp = Buffer.from(logo.toBitmap());
  const out = Buffer.alloc(canvas * canvas * 4, 0);
  const corner = Math.max(2, Math.floor(Number(radius) || 6));

  for (let y = 0; y < canvas; y++) {
    for (let x = 0; x < canvas; x++) {
      if (!inRoundedRect(x, y, canvas, corner)) continue;
      const idx = (y * canvas + x) * 4;
      out[idx] = 255;
      out[idx + 1] = 255;
      out[idx + 2] = 255;
      out[idx + 3] = 255;
    }
  }

  for (let y = 0; y < logoSize; y++) {
    for (let x = 0; x < logoSize; x++) {
      const src = (y * logoSize + x) * 4;
      const alpha = logoBmp[src + 3];
      if (!alpha) continue;
      const dx = x + pad;
      const dy = y + pad;
      if (dx < 0 || dy < 0 || dx >= canvas || dy >= canvas) continue;
      const dst = (dy * canvas + dx) * 4;
      const sa = alpha / 255;
      out[dst] = Math.round(logoBmp[src] * sa + out[dst] * (1 - sa));
      out[dst + 1] = Math.round(logoBmp[src + 1] * sa + out[dst + 1] * (1 - sa));
      out[dst + 2] = Math.round(logoBmp[src + 2] * sa + out[dst + 2] * (1 - sa));
      out[dst + 3] = 255;
    }
  }

  return nativeImage.createFromBuffer(out, { width: canvas, height: canvas });
}

function macTrayIconWithWhiteBackground(source) {
  const one = composeTrayIconWithWhiteBackground(source, { size: 22, inset: 2, radius: 6 });
  const two = composeTrayIconWithWhiteBackground(source, { size: 44, inset: 4, radius: 12 });
  if (!one) return null;
  if (two && typeof one.addRepresentation === 'function') {
    try {
      one.addRepresentation({
        scaleFactor: 2,
        buffer: two.toPNG(),
        width: 44,
        height: 44,
      });
    } catch (_) { /* 1x is enough */ }
  }
  if (typeof one.setTemplateImage === 'function') {
    one.setTemplateImage(false);
  }
  return one;
}

module.exports = {
  inRoundedRect,
  composeTrayIconWithWhiteBackground,
  macTrayIconWithWhiteBackground,
};
