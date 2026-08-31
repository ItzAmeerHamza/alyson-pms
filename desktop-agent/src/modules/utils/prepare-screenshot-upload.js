/**
 * Adaptive screenshot encode for S3.
 * Never returns an empty/unusable buffer: any failure keeps the original capture.
 */

const RESIZE_IF_LONGER_THAN_PX = 2560;
const TARGET_LONG_EDGE_PX = 1920;
const JPEG_QUALITY = 70;
const MIN_OUTPUT_BYTES = 200;

function longestEdge(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 0;
  return Math.max(w, h);
}

/** Pure policy: resize only when the longest edge is strictly above 2560. */
function shouldResizeLongestEdge(width, height) {
  return longestEdge(width, height) > RESIZE_IF_LONGER_THAN_PX;
}

function isJpegBuffer(buf) {
  return (
    Buffer.isBuffer(buf) &&
    buf.length >= MIN_OUTPUT_BYTES &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff
  );
}

async function looksLikeVisibleImage(buf, sharp) {
  if (!isJpegBuffer(buf)) return false;
  try {
    const meta = await sharp(buf).metadata();
    return Number(meta.width) >= 32 && Number(meta.height) >= 32;
  } catch {
    return false;
  }
}

function nativeImageFallback(buffer, nativeImage) {
  if (!nativeImage || !Buffer.isBuffer(buffer) || !buffer.length) return null;
  try {
    const img = nativeImage.createFromBuffer(buffer);
    if (!img || img.isEmpty()) return null;
    const size = img.getSize?.() || {};
    let source = img;
    if (shouldResizeLongestEdge(size.width, size.height)) {
      const scale = TARGET_LONG_EDGE_PX / longestEdge(size.width, size.height);
      const resized = img.resize({
        width: Math.max(32, Math.round(size.width * scale)),
        height: Math.max(32, Math.round(size.height * scale)),
      });
      if (resized && !resized.isEmpty()) source = resized;
    }
    const jpeg = source.toJPEG(JPEG_QUALITY);
    if (isJpegBuffer(jpeg)) return jpeg;
  } catch {
    /* caller keeps the original capture */
  }
  return null;
}

/**
 * @returns {Promise<{ buffer: Buffer, ext: string, contentType: string, route: string, resized: boolean }>}
 */
async function prepareScreenshotForUpload(buffer, options = {}) {
  const original = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  const fallback = {
    buffer: original,
    ext: 'png',
    contentType: 'image/png',
    route: 'original',
    resized: false,
  };
  if (original.length < MIN_OUTPUT_BYTES) return fallback;

  let sharpFn = options.sharp;
  if (!sharpFn) {
    try {
      sharpFn = require('sharp');
    } catch {
      sharpFn = null;
    }
  }

  if (sharpFn) {
    try {
      const meta = await sharpFn(original).rotate().metadata();
      const resize = shouldResizeLongestEdge(meta.width, meta.height);
      let pipeline = sharpFn(original).rotate();
      if (resize) {
        pipeline = pipeline.resize({
          width: TARGET_LONG_EDGE_PX,
          height: TARGET_LONG_EDGE_PX,
          fit: 'inside',
          withoutEnlargement: true,
        });
      }
      const jpeg = await pipeline.jpeg({ quality: JPEG_QUALITY }).toBuffer();
      if (await looksLikeVisibleImage(jpeg, sharpFn)) {
        return {
          buffer: jpeg,
          ext: 'jpg',
          contentType: 'image/jpeg',
          route: resize ? 'sharp-resize-q70' : 'sharp-q70',
          resized: resize,
        };
      }
    } catch {
      /* try nativeImage, then original */
    }
  }

  const nativeJpeg = nativeImageFallback(original, options.nativeImage);
  if (nativeJpeg) {
    return {
      buffer: nativeJpeg,
      ext: 'jpg',
      contentType: 'image/jpeg',
      route: 'nativeimage-q70',
      resized: false,
    };
  }

  return fallback;
}

module.exports = {
  RESIZE_IF_LONGER_THAN_PX,
  TARGET_LONG_EDGE_PX,
  JPEG_QUALITY,
  shouldResizeLongestEdge,
  prepareScreenshotForUpload,
};
