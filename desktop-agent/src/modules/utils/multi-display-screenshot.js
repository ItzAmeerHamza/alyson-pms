/**
 * Capture every connected display and stitch into a single PNG.
 * Uses Electron display count as source of truth; screenshot-desktop list
 * alone often under-reports on Windows (Duplicate / driver quirks).
 */

const screenshot = require('screenshot-desktop');

const MAX_STITCH_EDGE_PX = 7680;

/**
 * @returns {Promise<{success: boolean, buffer?: Buffer, method: string, displayCount?: number, error?: string}>}
 */
async function captureAllDisplaysStitched() {
  const electronCount = getElectronDisplayCount();
  let listed = [];
  try {
    listed = await screenshot.listDisplays();
  } catch (err) {
    console.warn('[MULTI-DISPLAY] listDisplays failed:', err.message);
  }

  const listedCount = Array.isArray(listed) ? listed.length : 0;
  console.log(
    `[MULTI-DISPLAY] Displays: electron=${electronCount}, screenshot-desktop=${listedCount}`
  );

  // Path 1: capture each display reported by screenshot-desktop
  let captures = [];
  if (listedCount >= 2) {
    captures = await captureFromListedDisplays(listed);
  }

  // Path 2: try numeric screen indices when Electron sees more monitors than we captured
  const targetCount = Math.max(electronCount, listedCount, 1);
  if (captures.length < 2 && targetCount >= 2) {
    const byIndex = await captureByScreenIndex(targetCount);
    if (byIndex.length > captures.length) {
      captures = byIndex;
    }
  }

  // Path 3: desktopCapturer — most reliable multi-monitor path on Windows
  if (captures.length < 2 && targetCount >= 2) {
    try {
      const viaCapturer = await captureViaDesktopCapturerStitched(getPreferredThumbnailSize());
      if (viaCapturer.success && viaCapturer.displayCount >= 2) {
        return viaCapturer;
      }
      if (viaCapturer.success && viaCapturer.buffer && captures.length === 0) {
        return viaCapturer;
      }
    } catch (err) {
      console.warn('[MULTI-DISPLAY] desktopCapturer path failed:', err.message);
    }
  }

  if (captures.length === 0) {
    return capturePrimaryOnly('screenshot-desktop');
  }

  if (captures.length === 1) {
    // Last try: desktopCapturer even if Electron count was stale/1
    if (targetCount >= 2 || electronCount >= 2) {
      try {
        const viaCapturer = await captureViaDesktopCapturerStitched(getPreferredThumbnailSize());
        if (viaCapturer.success && viaCapturer.displayCount >= 2) {
          return viaCapturer;
        }
      } catch (_) {
        /* keep single capture */
      }
    }
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

async function captureFromListedDisplays(displays) {
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
  return captures;
}

/**
 * Some Windows builds accept screen: 0, 1, ... even when listDisplays is incomplete.
 */
async function captureByScreenIndex(count) {
  const captures = [];
  const max = Math.min(Math.max(count, 0), 6);
  for (let i = 0; i < max; i++) {
    try {
      const buffer = await screenshot({ screen: i, format: 'png' });
      if (buffer && buffer.length > 0) {
        // Skip duplicate buffers (same size + first 64 bytes) from failed multi-index
        const dup = captures.some(
          (c) =>
            c.buffer.length === buffer.length &&
            c.buffer.subarray(0, 64).equals(buffer.subarray(0, 64))
        );
        if (!dup) {
          captures.push({ id: i, primary: i === 0, buffer });
        }
      }
    } catch (err) {
      console.warn(`[MULTI-DISPLAY] screen index ${i} capture failed:`, err.message);
    }
  }
  return captures;
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
    const aId = Number(a.id);
    const bId = Number(b.id);
    if (!Number.isNaN(aId) && !Number.isNaN(bId)) return aId - bId;
    return String(a.id).localeCompare(String(b.id));
  });

  const metas = await Promise.all(sorted.map((c) => sharp(c.buffer).metadata()));
  const electronLayouts = getElectronLayouts();

  let composites;
  let canvasW;
  let canvasH;

  // Prefer geometric layout only when we can pair by similar physical size
  const layoutMatch =
    electronLayouts &&
    electronLayouts.length === sorted.length &&
    layoutsMatchCaptureSizes(electronLayouts, metas);

  if (layoutMatch) {
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

function layoutsMatchCaptureSizes(layouts, metas) {
  // Soft check: each capture width/height roughly matches a layout size (order already primary-first)
  for (let i = 0; i < layouts.length; i++) {
    const lw = layouts[i].width || 0;
    const lh = layouts[i].height || 0;
    const mw = metas[i].width || 0;
    const mh = metas[i].height || 0;
    if (!lw || !lh || !mw || !mh) return false;
    const wr = Math.abs(lw - mw) / Math.max(lw, mw);
    const hr = Math.abs(lh - mh) / Math.max(lh, mh);
    if (wr > 0.2 || hr > 0.2) return false;
  }
  return true;
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
        y: Math.round(d.bounds.y * sf),
        width: Math.round(d.size.width * sf),
        height: Math.round(d.size.height * sf)
      };
    });
  } catch (_) {
    return null;
  }
}

function getElectronDisplayCount() {
  try {
    const { screen } = require('electron');
    if (!screen || typeof screen.getAllDisplays !== 'function') return 0;
    return screen.getAllDisplays().length || 0;
  } catch (_) {
    return 0;
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

  const size = thumbnailSize || getPreferredThumbnailSize();
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: size
  });

  const withImages = (sources || []).filter((s) => s?.thumbnail && !s.thumbnail.isEmpty());
  console.log(`[MULTI-DISPLAY] desktopCapturer sources=${(sources || []).length}, withImages=${withImages.length}`);

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

  // Order: match Electron primary / left-to-right when display_id is present
  const layouts = getElectronLayouts() || [];
  const ordered = withImages.slice().sort((a, b) => {
    const ai = layouts.findIndex((l) => String(l.id) === String(a.display_id));
    const bi = layouts.findIndex((l) => String(l.id) === String(b.display_id));
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return 0;
  });

  const captures = ordered.map((s, i) => ({
    id: s.display_id || i,
    primary: i === 0 || (layouts[0] && String(s.display_id) === String(layouts[0].id)),
    buffer: s.thumbnail.toPNG()
  }));

  // Ensure exactly one primary flag
  let sawPrimary = false;
  for (const c of captures) {
    if (c.primary && !sawPrimary) {
      sawPrimary = true;
    } else if (c.primary) {
      c.primary = false;
    }
  }
  if (!sawPrimary && captures.length) captures[0].primary = true;

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
    // Cap request size so desktopCapturer stays responsive
    maxW = Math.min(maxW, 3840);
    maxH = Math.min(maxH, 2160);
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
