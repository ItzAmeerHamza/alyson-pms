/**
 * Capture every connected display and stitch into a single PNG.
 * Falls back to primary-only if listing, capture, or stitch fails.
 */

const screenshot = require('screenshot-desktop');

const MAX_STITCH_EDGE_PX = 7680;

/**
 * @returns {Promise<{success: boolean, buffer?: Buffer, method: string, displayCount?: number, error?: string}>}
 */
async function captureAllDisplaysStitched() {
  let displays = [];
  try {
    displays = await screenshot.listDisplays();
  } catch (err) {
    console.warn('[MULTI-DISPLAY] listDisplays failed:', err.message);
  }

  if (!Array.isArray(displays) || displays.length <= 1) {
    return capturePrimaryOnly('screenshot-desktop');
  }

  console.log(`[MULTI-DISPLAY] Capturing ${displays.length} displays for stitch`);

  const captures = [];
  for (const display of displays) {
    try {
      const buffer = await screenshot({ screen: display.id, format: 'png' });
      if (buffer && buffer.length > 0) {
        captures.push({
          id: display.id,
          primary: !!display.primary,
          buffer
        });
      }
    } catch (err) {
      console.warn(`[MULTI-DISPLAY] Display ${display.id} capture failed:`, err.message);
    }
  }

  if (captures.length === 0) {
    return {
      success: false,
      method: 'screenshot-desktop-stitched',
      error: 'No display captures succeeded'
    };
  }

  if (captures.length === 1) {
    return {
      success: true,
      buffer: captures[0].buffer,
      method: 'screenshot-desktop',
      displayCount: 1
    };
  }

  try {
    const buffer = await stitchCaptures(captures);
    return {
      success: true,
      buffer,
      method: 'screenshot-desktop-stitched',
      displayCount: captures.length
    };
  } catch (stitchErr) {
    console.warn('[MULTI-DISPLAY] Stitch failed, using primary capture:', stitchErr.message);
    const primary = captures.find((c) => c.primary) || captures[0];
    return {
      success: true,
      buffer: primary.buffer,
      method: 'screenshot-desktop-primary-fallback',
      displayCount: 1
    };
  }
}

async function capturePrimaryOnly(method) {
  try {
    const buffer = await screenshot({ format: 'png' });
    if (!buffer || buffer.length === 0) {
      return { success: false, method, error: 'Empty buffer returned' };
    }
    return { success: true, buffer, method, displayCount: 1 };
  } catch (error) {
    return { success: false, method, error: error.message };
  }
}

/**
 * Stitch using Electron display bounds when counts match; otherwise side-by-side.
 * @param {Array<{id: *, primary: boolean, buffer: Buffer}>} captures
 */
async function stitchCaptures(captures) {
  const sharp = require('sharp');

  const sorted = captures.slice().sort((a, b) => {
    if (a.primary !== b.primary) return a.primary ? -1 : 1;
    return Number(a.id) - Number(b.id);
  });

  const metas = await Promise.all(sorted.map((c) => sharp(c.buffer).metadata()));
  const electronLayouts = getElectronLayouts();

  let composites;
  let canvasW;
  let canvasH;

  if (electronLayouts && electronLayouts.length === sorted.length) {
    const placed = sorted.map((c, i) => {
      const layout = electronLayouts[i];
      return {
        input: c.buffer,
        left: layout.x,
        top: layout.y,
        width: metas[i].width || 0,
        height: metas[i].height || 0
      };
    });
    const minX = Math.min(...placed.map((p) => p.left));
    const minY = Math.min(...placed.map((p) => p.top));
    composites = placed.map((p) => ({
      input: p.input,
      left: Math.max(0, p.left - minX),
      top: Math.max(0, p.top - minY)
    }));
    canvasW = Math.max(...composites.map((p, i) => p.left + (metas[i].width || 0)));
    canvasH = Math.max(...composites.map((p, i) => p.top + (metas[i].height || 0)));
  } else {
    // Side-by-side: primary first, then remaining left-to-right
    let left = 0;
    canvasH = Math.max(...metas.map((m) => m.height || 0));
    composites = sorted.map((c, i) => {
      const top = Math.floor((canvasH - (metas[i].height || 0)) / 2);
      const item = { input: c.buffer, left, top: Math.max(0, top) };
      left += metas[i].width || 0;
      return item;
    });
    canvasW = left;
  }

  if (!canvasW || !canvasH) {
    throw new Error('Invalid stitch canvas dimensions');
  }

  let pipeline = sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 3,
      background: { r: 16, g: 16, b: 16 }
    }
  }).composite(composites);

  if (canvasW > MAX_STITCH_EDGE_PX || canvasH > MAX_STITCH_EDGE_PX) {
    pipeline = pipeline.resize({
      width: canvasW > canvasH ? MAX_STITCH_EDGE_PX : undefined,
      height: canvasH >= canvasW ? MAX_STITCH_EDGE_PX : undefined,
      fit: 'inside',
      withoutEnlargement: true
    });
  }

  return pipeline.png({ compressionLevel: 6 }).toBuffer();
}

/**
 * Electron display order: primary first, then by bounds (x, y).
 * Positions use physical pixels (bounds * scaleFactor).
 */
function getElectronLayouts() {
  try {
    const { screen } = require('electron');
    if (!screen || typeof screen.getAllDisplays !== 'function') return null;

    const primary = screen.getPrimaryDisplay();
    const others = screen
      .getAllDisplays()
      .filter((d) => d.id !== primary.id)
      .sort((a, b) => (a.bounds.x - b.bounds.x) || (a.bounds.y - b.bounds.y));

    const ordered = [primary, ...others];
    return ordered.map((d) => {
      const sf = d.scaleFactor || 1;
      return {
        id: d.id,
        x: Math.round(d.bounds.x * sf),
        y: Math.round(d.bounds.y * sf)
      };
    });
  } catch (_) {
    return null;
  }
}

/**
 * desktopCapturer fallback: stitch all screen thumbnails into one image.
 * @param {{ width: number, height: number }} thumbnailSize
 */
async function captureViaDesktopCapturerStitched(thumbnailSize) {
  const { desktopCapturer } = require('electron');
  if (!desktopCapturer || typeof desktopCapturer.getSources !== 'function') {
    throw new Error('desktopCapturer unavailable');
  }

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: thumbnailSize || { width: 1920, height: 1080 }
  });

  const withImages = (sources || []).filter((s) => s?.thumbnail && !s.thumbnail.isEmpty());
  if (withImages.length === 0) {
    throw new Error('No screen sources available');
  }

  if (withImages.length === 1) {
    const pngBuffer = withImages[0].thumbnail.toPNG();
    if (!pngBuffer || pngBuffer.length === 0) {
      throw new Error('desktopCapturer returned empty thumbnail');
    }
    return {
      success: true,
      buffer: pngBuffer,
      method: 'desktopCapturer',
      displayCount: 1
    };
  }

  const captures = withImages.map((s, i) => ({
    id: s.display_id || i,
    primary: i === 0,
    buffer: s.thumbnail.toPNG()
  }));

  const buffer = await stitchCaptures(captures);
  return {
    success: true,
    buffer,
    method: 'desktopCapturer-stitched',
    displayCount: captures.length
  };
}

function getPreferredThumbnailSize() {
  try {
    const { screen } = require('electron');
    const displays = screen.getAllDisplays();
    let maxW = 1920;
    let maxH = 1080;
    for (const d of displays) {
      const sf = d.scaleFactor || 1;
      maxW = Math.max(maxW, Math.round(d.size.width * sf));
      maxH = Math.max(maxH, Math.round(d.size.height * sf));
    }
    return { width: maxW, height: maxH };
  } catch (_) {
    return { width: 1920, height: 1080 };
  }
}

module.exports = {
  captureAllDisplaysStitched,
  captureViaDesktopCapturerStitched,
  getPreferredThumbnailSize
};
