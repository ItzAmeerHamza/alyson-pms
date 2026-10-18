'use strict';

const { nativeImage } = require('electron');

/** Matches PLATE_FILL in scripts/generate-icons.mjs. */
const PLATE_RGB = { r: 255, g: 255, b: 255 };

function inRoundedRect(x, y, width, height, radius) {
  const w = Math.floor(width);
  const h = radius == null ? w : Math.floor(height);
  const rawRadius = radius == null ? height : radius;
  const r = Math.max(0, Math.min(Math.floor(rawRadius), Math.floor(Math.min(w, h) / 2)));
  if (x >= r && x < w - r) return y >= 0 && y < h;
  if (y >= r && y < h - r) return x >= 0 && x < w;
  const cx = x < r ? r : w - 1 - r;
  const cy = y < r ? r : h - 1 - r;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function sourceAspect(source) {
  const size = source.getSize ? source.getSize() : null;
  if (!size || !size.width || !size.height) return 1;
  return size.width / size.height;
}

/**
 * Sit the Tavilo mark on a white plate. A square `size` keeps the Windows
 * taskbar icon opaque. A `height` lets the menu bar follow the wide mark.
 */
function composeTrayIconWithBackground(source, { size, height, inset = 2, radius = 6 } = {}) {
  if (!source || typeof source.isEmpty === 'function' && source.isEmpty()) return null;
  const pad = Math.max(1, Math.floor(Number(inset) || 2));
  const square = size != null && height == null;
  const canvasH = Math.max(16, Math.floor(Number(height || size) || 22));
  const aspect = Math.max(0.2, sourceAspect(source));
  const inner = Math.max(8, canvasH - pad * 2);
  let logoW;
  let logoH;
  if (square) {
    logoW = inner;
    logoH = Math.max(1, Math.round(inner / aspect));
    if (logoH > inner) {
      logoH = inner;
      logoW = Math.max(1, Math.round(inner * aspect));
    }
  } else {
    logoH = inner;
    logoW = Math.max(8, Math.round(logoH * aspect));
  }
  const canvasW = square ? canvasH : logoW + pad * 2;
  const logo = source.resize({ width: logoW, height: logoH });
  const drawn = logo.getSize ? logo.getSize() : { width: logoW, height: logoH };
  const drawW = Math.max(1, Math.floor(drawn.width || logoW));
  const drawH = Math.max(1, Math.floor(drawn.height || logoH));
  const logoBmp = Buffer.from(logo.toBitmap());
  const out = Buffer.alloc(canvasW * canvasH * 4, 0);
  const requested = Number(radius);
  const corner = Math.max(0, Math.floor(Number.isFinite(requested) ? requested : 6));

  for (let y = 0; y < canvasH; y++) {
    for (let x = 0; x < canvasW; x++) {
      if (!inRoundedRect(x, y, canvasW, canvasH, corner)) continue;
      const idx = (y * canvasW + x) * 4;
      out[idx] = PLATE_RGB.b;
      out[idx + 1] = PLATE_RGB.g;
      out[idx + 2] = PLATE_RGB.r;
      out[idx + 3] = 255;
    }
  }

  const left = Math.max(0, Math.floor((canvasW - drawW) / 2));
  const top = Math.max(0, Math.floor((canvasH - drawH) / 2));
  for (let y = 0; y < drawH; y++) {
    for (let x = 0; x < drawW; x++) {
      const src = (y * drawW + x) * 4;
      if (src + 3 >= logoBmp.length) continue;
      const alpha = logoBmp[src + 3];
      if (!alpha) continue;
      const dx = x + left;
      const dy = y + top;
      if (dx < 0 || dy < 0 || dx >= canvasW || dy >= canvasH) continue;
      const dst = (dy * canvasW + dx) * 4;
      const sa = alpha / 255;
      out[dst] = Math.round(logoBmp[src] * sa + out[dst] * (1 - sa));
      out[dst + 1] = Math.round(logoBmp[src + 1] * sa + out[dst + 1] * (1 - sa));
      out[dst + 2] = Math.round(logoBmp[src + 2] * sa + out[dst + 2] * (1 - sa));
      out[dst + 3] = 255;
    }
  }

  return nativeImage.createFromBuffer(out, { width: canvasW, height: canvasH });
}

/**
 * Build a tray image from 1x and 2x PNGs. A file named @2x reports its size in
 * points while toBitmap() is the full pixel buffer, so the representation has
 * to be attached explicitly. Passing the PNG bytes as a raw bitmap makes macOS
 * ignore the sharp image and scale the 18px one.
 */
function representationFromImage(loaded, scaleFactor) {
  if (!loaded || typeof loaded.isEmpty === 'function' && loaded.isEmpty()) return null;
  const dip = loaded.getSize ? loaded.getSize() : null;
  const bitmap = Buffer.from(loaded.toBitmap());
  const pixels = bitmap.length / 4;
  if (!dip || !dip.width || !dip.height || !pixels) return null;
  let width = dip.width;
  let height = dip.height;
  if (width * height !== pixels) {
    const aspect = dip.width / dip.height;
    height = Math.max(1, Math.round(Math.sqrt(pixels / aspect)));
    width = Math.max(1, Math.round(pixels / height));
    if (width * height !== pixels) return null;
  }
  return { scaleFactor, width, height, buffer: bitmap };
}

function imageFromScaleFiles(files) {
  const image = nativeImage.createEmpty();
  files.forEach(({ loaded, scaleFactor }) => {
    const rep = representationFromImage(loaded, scaleFactor);
    if (rep && typeof image.addRepresentation === 'function') image.addRepresentation(rep);
  });
  if (typeof image.isEmpty === 'function' && image.isEmpty()) return null;
  if (typeof image.setTemplateImage === 'function') image.setTemplateImage(false);
  return image;
}

function macTrayIconWithBackground(source) {
  const one = composeTrayIconWithBackground(source, { height: 22, inset: 2, radius: 5 });
  const two = composeTrayIconWithBackground(source, { height: 44, inset: 4, radius: 10 });
  if (!one) return null;
  if (two && typeof one.addRepresentation === 'function') {
    try {
      const twoSize = two.getSize ? two.getSize() : { width: 44, height: 44 };
      one.addRepresentation({
        scaleFactor: 2,
        buffer: two.toPNG(),
        width: twoSize.width,
        height: twoSize.height,
      });
    } catch (_) { /* 1x is enough */ }
  }
  if (typeof one.setTemplateImage === 'function') {
    one.setTemplateImage(false);
  }
  return one;
}

module.exports = {
  PLATE_RGB,
  inRoundedRect,
  composeTrayIconWithBackground,
  macTrayIconWithBackground,
  representationFromImage,
  imageFromScaleFiles,
};
