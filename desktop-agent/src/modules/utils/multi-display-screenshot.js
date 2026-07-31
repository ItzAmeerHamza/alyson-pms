/**
 * Capture every connected display and stitch into a single PNG.
 *
 * Electron's screen.getAllDisplays() is the source of truth for monitor count.
 * screenshot-desktop's listDisplays() (system_profiler on macOS) often under-reports
 * external monitors — which previously left us capturing only the laptop panel.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
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
  // Always trust Electron when it sees more monitors than screenshot-desktop.
  const targetCount = Math.max(electronCount, listedCount, 1);
  console.log(
    `[MULTI-DISPLAY] Displays: electron=${electronCount}, screenshot-desktop=${listedCount}, target=${targetCount}`
  );

  // When multiple monitors are present, prefer Electron desktopCapturer first.
  // It sees the same display topology as the OS session (incl. external screens).
  if (targetCount >= 2) {
    try {
      const viaCapturer = await captureViaDesktopCapturerStitched(getPreferredThumbnailSize());
      if (viaCapturer.success && (viaCapturer.displayCount || 0) >= 2) {
        console.log(
          `[MULTI-DISPLAY] Using desktopCapturer stitch (${viaCapturer.displayCount} displays)`
        );
        return annotateMultiDisplayResult(viaCapturer, targetCount);
      }
      console.warn(
        `[MULTI-DISPLAY] desktopCapturer returned ${viaCapturer.displayCount || 0} display(s); trying native paths`
      );
    } catch (err) {
      console.warn('[MULTI-DISPLAY] desktopCapturer path failed:', err.message);
    }
  }

  // Platform-native per-display capture (independent of screenshot-desktop quirks)
  if (targetCount >= 2) {
    const nativeCaptures = await captureViaPlatformNativeAllScreens(targetCount);
    if (nativeCaptures.length >= 2) {
      try {
        const buffer = await stitchCaptures(nativeCaptures);
        return annotateMultiDisplayResult({
          success: true,
          buffer,
          method:
            process.platform === 'win32'
              ? 'windows-powershell-stitched'
              : nativeCaptures[0]?.id === 0 && nativeCaptures.length >= 2
                ? 'screencapture-native-stitched'
                : 'screencapture-D-stitched',
          displayCount: nativeCaptures.length,
        }, targetCount);
      } catch (stitchErr) {
        console.warn('[MULTI-DISPLAY] native stitch failed:', stitchErr.message);
      }
    } else if (nativeCaptures.length === 1) {
      console.warn('[MULTI-DISPLAY] native path only got 1 pane; continuing fallbacks');
    }
  }

  // screenshot-desktop.all() — passes N temp paths to screencapture / Windows API
  if (targetCount >= 2 && typeof screenshot.all === 'function') {
    try {
      const buffers = await screenshot.all();
      const unique = uniqueCaptureBuffers(
        (buffers || [])
          .filter((b) => b && b.length > 0)
          .map((buffer, i) => ({ id: i, primary: i === 0, buffer })),
      );
      console.log(`[MULTI-DISPLAY] screenshot.all() returned ${unique.length} unique buffer(s)`);
      if (unique.length >= 2) {
        const buffer = await stitchCaptures(unique);
        return annotateMultiDisplayResult({
          success: true,
          buffer,
          method: 'screenshot-desktop-all-stitched',
          displayCount: unique.length,
        }, targetCount);
      }
    } catch (err) {
      console.warn('[MULTI-DISPLAY] screenshot.all() failed:', err.message);
    }
  }

  // Per-display via listDisplays ids
  // Windows IDs look like \\.\DISPLAY1 — numeric indices alone are unreliable.
  let captures = [];
  if (listedCount >= 2) {
    captures = await captureFromListedDisplays(listed);
  } else if (process.platform === 'win32' && listedCount >= 1 && targetCount >= 2) {
    // Even if listDisplays under-counted vs Electron, capture every listed id,
    // then fill gaps with DISPLAY2/DISPLAY3 guesses + PowerShell.
    captures = await captureFromListedDisplays(listed);
    const guessed = await captureWindowsDisplayNameGuesses(targetCount);
    if (guessed.length > captures.length) captures = guessed;
  }

  // Numeric screen indices — useful on both macOS and some Windows GPU drivers
  if (captures.length < 2 && targetCount >= 2) {
    const byIndex = await captureByScreenIndex(targetCount);
    if (byIndex.length > captures.length) {
      captures = byIndex;
    }
  }

  // Final desktopCapturer retry
  if (captures.length < 2 && targetCount >= 2) {
    try {
      const viaCapturer = await captureViaDesktopCapturerStitched(getPreferredThumbnailSize());
      if (viaCapturer.success && viaCapturer.displayCount >= 2) {
        return annotateMultiDisplayResult(viaCapturer, targetCount);
      }
      if (viaCapturer.success && viaCapturer.buffer && captures.length === 0) {
        return annotateMultiDisplayResult(viaCapturer, targetCount);
      }
    } catch (err) {
      console.warn('[MULTI-DISPLAY] desktopCapturer retry failed:', err.message);
    }
  }

  if (captures.length === 0) {
    const primary = await capturePrimaryOnly('screenshot-desktop');
    return annotateMultiDisplayResult(primary, targetCount);
  }

  if (captures.length === 1) {
    return annotateMultiDisplayResult({
      success: true,
      buffer: captures[0].buffer,
      method: 'screenshot-desktop',
      displayCount: 1,
    }, targetCount);
  }

  try {
    const buffer = await stitchCaptures(captures);
    return annotateMultiDisplayResult({
      success: true,
      buffer,
      method: 'screenshot-desktop-stitched',
      displayCount: captures.length,
    }, targetCount);
  } catch (stitchErr) {
    console.warn('[MULTI-DISPLAY] Stitch failed, using primary capture:', stitchErr.message);
    const primary = captures.find((c) => c.primary) || captures[0];
    return annotateMultiDisplayResult({
      success: true,
      buffer: primary.buffer,
      method: 'screenshot-desktop-primary-fallback',
      displayCount: 1,
    }, targetCount);
  }
}

/**
 * Never silently claim multi-monitor success when Electron sees more displays
 * than we actually captured.
 */
function annotateMultiDisplayResult(result, expectedCount) {
  if (!result || !result.success) return result;
  const got = Math.max(0, Number(result.displayCount) || 0);
  const expected = Math.max(0, Number(expectedCount) || 0);
  if (expected >= 2 && got < expected) {
    console.error(
      `[MULTI-DISPLAY] INCOMPLETE: expected ${expected} display(s), captured ${got} (method=${result.method})`,
    );
    return {
      ...result,
      incompleteMultiDisplay: true,
      expectedDisplayCount: expected,
    };
  }
  return {
    ...result,
    incompleteMultiDisplay: false,
    expectedDisplayCount: expected || got,
  };
}

/**
 * Platform-native multi-monitor capture used on both Mac and Windows.
 */
async function captureViaPlatformNativeAllScreens(count) {
  if (process.platform === 'darwin') {
    // Apple's documented multi-monitor form: N output paths → N display images.
    // Must use Electron count, NOT screenshot-desktop listDisplays (often under-counts).
    const multiFile = await captureViaMacScreencaptureMultiFile(count);
    if (multiFile.length >= 2) return multiFile;
    return captureViaMacScreencaptureDashD(count);
  }
  if (process.platform === 'win32') {
    return captureViaWindowsPowerShellAllScreens();
  }
  return [];
}

/**
 * macOS: `screencapture file1 file2 ...` writes one file per connected display.
 * Path count comes from Electron display count (source of truth).
 */
async function captureViaMacScreencaptureMultiFile(count) {
  const max = Math.min(Math.max(count, 0), 6);
  if (max < 1) return [];

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-ss-mf-'));
  const paths = [];
  for (let i = 0; i < max; i++) {
    paths.push(path.join(tmpDir, `mf-${i}.png`));
  }

  try {
    await execFileAsync('screencapture', ['-x', '-t', 'png', ...paths], {
      timeout: 20000,
    });

    const captures = [];
    for (let i = 0; i < paths.length; i++) {
      if (!fs.existsSync(paths[i])) continue;
      const buffer = fs.readFileSync(paths[i]);
      if (buffer?.length) {
        captures.push({ id: i, primary: i === 0, buffer });
      }
    }
    console.log(
      `[MULTI-DISPLAY] screencapture multi-file: requested=${max}, got=${captures.length}`,
    );
    return uniqueCaptureBuffers(captures);
  } catch (err) {
    console.warn('[MULTI-DISPLAY] screencapture multi-file failed:', err?.message || err);
    return [];
  } finally {
    try {
      for (const f of fs.readdirSync(tmpDir)) {
        try { fs.unlinkSync(path.join(tmpDir, f)); } catch (_) {}
      }
      fs.rmdirSync(tmpDir);
    } catch (_) {}
  }
}

/**
 * macOS: screencapture -D1 / -D2 / ... for each display Electron reports.
 * -D is 1-based and independent of screenshot-desktop's broken listDisplays parser.
 */
async function captureViaMacScreencaptureDashD(count) {
  const captures = [];
  const max = Math.min(Math.max(count, 0), 6);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-ss-'));

  try {
    for (let n = 1; n <= max; n++) {
      const file = path.join(tmpDir, `display-${n}.png`);
      try {
        await execFileAsync('screencapture', ['-x', '-t', 'png', `-D${n}`, file], {
          timeout: 15000,
        });
        if (fs.existsSync(file)) {
          const buffer = fs.readFileSync(file);
          if (buffer && buffer.length > 0) {
            captures.push({ id: n - 1, primary: n === 1, buffer });
            console.log(`[MULTI-DISPLAY] screencapture -D${n} ok (${buffer.length} bytes)`);
          }
        }
      } catch (err) {
        const msg = String(err?.stderr || err?.message || err);
        // Stop once OS says that display index is invalid
        if (/invalid display|only \d+ display/i.test(msg)) {
          console.warn(`[MULTI-DISPLAY] screencapture -D${n} not available: ${msg.trim()}`);
          break;
        }
        console.warn(`[MULTI-DISPLAY] screencapture -D${n} failed:`, msg.trim());
      }
    }
  } finally {
    try {
      for (const f of fs.readdirSync(tmpDir)) {
        try { fs.unlinkSync(path.join(tmpDir, f)); } catch (_) {}
      }
      fs.rmdirSync(tmpDir);
    } catch (_) {}
  }

  return uniqueCaptureBuffers(captures);
}

/**
 * Windows: capture every screen via System.Windows.Forms.Screen.AllScreens.
 * Does not depend on screenshot-desktop bat / DISPLAY name parsing.
 */
async function captureViaWindowsPowerShellAllScreens() {
  if (process.platform !== 'win32') return [];

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-ss-win-'));
  const scriptPath = path.join(tmpDir, 'capture-all.ps1');
  const ps = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
# Mixed-DPI dual monitors need process DPI awareness or secondary CopyFromScreen is wrong/blank.
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class AlysonDpi {
  [DllImport("user32.dll")]
  public static extern bool SetProcessDPIAware();
}
"@
try { [void][AlysonDpi]::SetProcessDPIAware() } catch {}
$outDir = '${tmpDir.replace(/'/g, "''")}'
$screens = [System.Windows.Forms.Screen]::AllScreens | Sort-Object { if ($_.Primary) { 0 } else { 1 } }, { $_.Bounds.X }, { $_.Bounds.Y }
$i = 0
foreach ($s in $screens) {
  $b = $s.Bounds
  $w = [Math]::Max(1, [int]$b.Width)
  $h = [Math]::Max(1, [int]$b.Height)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.CopyFromScreen([int]$b.X, [int]$b.Y, 0, 0, (New-Object System.Drawing.Size $w, $h))
  } catch {
    # Retry once with Bounds.Location overload
    $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, (New-Object System.Drawing.Size $w, $h))
  }
  $file = Join-Path $outDir ("display-" + $i + ".png")
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  $i++
}
Write-Output ("screens=" + $screens.Count + ";captured=" + $i)
`.trim();

  try {
    fs.writeFileSync(scriptPath, ps, 'utf8');
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      { timeout: 45000, windowsHide: true },
    );

    const captures = [];
    const files = fs
      .readdirSync(tmpDir)
      .filter((f) => /^display-\d+\.png$/i.test(f))
      .sort((a, b) => {
        const ai = Number(a.match(/\d+/)?.[0] || 0);
        const bi = Number(b.match(/\d+/)?.[0] || 0);
        return ai - bi;
      });

    for (const file of files) {
      const buffer = fs.readFileSync(path.join(tmpDir, file));
      if (buffer?.length) {
        const idx = Number(file.match(/\d+/)?.[0] || captures.length);
        captures.push({ id: idx, primary: idx === 0, buffer });
      }
    }

    console.log(`[MULTI-DISPLAY] Windows PowerShell captured ${captures.length} display(s)`);
    return uniqueCaptureBuffers(captures);
  } catch (err) {
    console.warn('[MULTI-DISPLAY] Windows PowerShell capture failed:', err?.message || err);
    return [];
  } finally {
    try {
      for (const f of fs.readdirSync(tmpDir)) {
        try { fs.unlinkSync(path.join(tmpDir, f)); } catch (_) {}
      }
      fs.rmdirSync(tmpDir);
    } catch (_) {}
  }
}

/**
 * Windows fallback: try \\.\DISPLAY1 .. DISPLAYN when listDisplays under-reports.
 */
async function captureWindowsDisplayNameGuesses(count) {
  const captures = [];
  const max = Math.min(Math.max(count, 0), 6);
  for (let n = 1; n <= max; n++) {
    const id = `\\\\.\\DISPLAY${n}`;
    try {
      const buffer = await screenshot({ screen: id, format: 'png' });
      if (buffer && buffer.length > 0) {
        captures.push({ id, primary: n === 1, buffer });
      }
    } catch (err) {
      console.warn(`[MULTI-DISPLAY] ${id} capture failed:`, err.message);
    }
  }
  return uniqueCaptureBuffers(captures);
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
          buffer,
        });
      }
    } catch (err) {
      console.warn(`[MULTI-DISPLAY] Display ${display.id} capture failed:`, err.message);
    }
  }
  return uniqueCaptureBuffers(captures);
}

/**
 * Some Windows builds accept screen: 0, 1, ... even when listDisplays is incomplete.
 * On macOS, screenshot-desktop validates against listDisplays length — so this often
 * cannot capture external screens when profiler under-counts. Prefer -D path instead.
 */
async function captureByScreenIndex(count) {
  const captures = [];
  const max = Math.min(Math.max(count, 0), 6);
  for (let i = 0; i < max; i++) {
    try {
      const buffer = await screenshot({ screen: i, format: 'png' });
      if (buffer && buffer.length > 0) {
        captures.push({ id: i, primary: i === 0, buffer });
      }
    } catch (err) {
      console.warn(`[MULTI-DISPLAY] screen index ${i} capture failed:`, err.message);
    }
  }
  return uniqueCaptureBuffers(captures);
}

function uniqueCaptureBuffers(captures) {
  const out = [];
  for (const c of captures || []) {
    if (!c?.buffer?.length) continue;
    const dup = out.some(
      (prev) =>
        prev.buffer.length === c.buffer.length &&
        prev.buffer.subarray(0, 64).equals(c.buffer.subarray(0, 64)),
    );
    if (!dup) out.push(c);
  }
  return out;
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

function sortCapturesForStitch(captures) {
  return captures.slice().sort((a, b) => {
    if (a.primary !== b.primary) return a.primary ? -1 : 1;
    const aId = Number(a.id);
    const bId = Number(b.id);
    if (!Number.isNaN(aId) && !Number.isNaN(bId)) return aId - bId;
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * Stitch using Electron display bounds when counts match; otherwise side-by-side.
 * Prefer sharp; on Windows fall back to System.Drawing if sharp is missing/broken
 * (common when packaged without @img/sharp-win32-* or asarUnpack).
 * @param {Array<{id: *, primary: boolean, buffer: Buffer}>} captures
 */
async function stitchCaptures(captures) {
  if (!Array.isArray(captures) || captures.length < 2) {
    throw new Error('Need at least 2 captures to stitch');
  }

  try {
    return await stitchCapturesWithSharp(captures);
  } catch (sharpErr) {
    console.warn('[MULTI-DISPLAY] sharp stitch failed:', sharpErr?.message || sharpErr);
    if (process.platform === 'win32') {
      console.warn('[MULTI-DISPLAY] Trying Windows GDI stitch fallback');
      return stitchCapturesViaWindowsGdi(captures);
    }
    throw sharpErr;
  }
}

async function stitchCapturesWithSharp(captures) {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (err) {
    throw new Error(`sharp unavailable: ${err.message}`);
  }

  const sorted = sortCapturesForStitch(captures);
  const metas = await Promise.all(sorted.map((c) => sharp(c.buffer).metadata()));
  const electronLayouts = getElectronLayouts();

  let composites;
  let canvasW;
  let canvasH;

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
        height: metas[i].height || 0,
      };
    });
    const minX = Math.min(...placed.map((p) => p.left));
    const minY = Math.min(...placed.map((p) => p.top));
    composites = placed.map((p) => ({
      input: p.input,
      left: Math.max(0, p.left - minX),
      top: Math.max(0, p.top - minY),
    }));
    canvasW = Math.max(...composites.map((p, i) => p.left + (metas[i].width || 0)));
    canvasH = Math.max(...composites.map((p, i) => p.top + (metas[i].height || 0)));
  } else {
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
      background: { r: 16, g: 16, b: 16 },
    },
  }).composite(composites);

  if (canvasW > MAX_STITCH_EDGE_PX || canvasH > MAX_STITCH_EDGE_PX) {
    pipeline = pipeline.resize({
      width: canvasW > canvasH ? MAX_STITCH_EDGE_PX : undefined,
      height: canvasH >= canvasW ? MAX_STITCH_EDGE_PX : undefined,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  return pipeline.png({ compressionLevel: 6 }).toBuffer();
}

/**
 * Windows-only stitch via System.Drawing (no sharp / native node binary required).
 * Side-by-side layout; good enough when sharp packaging fails in the NSIS build.
 */
async function stitchCapturesViaWindowsGdi(captures) {
  if (process.platform !== 'win32') {
    throw new Error('Windows GDI stitch is only available on win32');
  }

  const sorted = sortCapturesForStitch(captures);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-stitch-'));
  const outFile = path.join(tmpDir, 'stitched.png');
  const scriptPath = path.join(tmpDir, 'stitch.ps1');
  const paneFiles = [];

  try {
    for (let i = 0; i < sorted.length; i++) {
      const panePath = path.join(tmpDir, `pane-${i}.png`);
      fs.writeFileSync(panePath, sorted[i].buffer);
      paneFiles.push(panePath);
    }

    const paneList = paneFiles.map((p) => `'${p.replace(/'/g, "''")}'`).join(',');
    const ps = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$files = @(${paneList})
$images = @()
foreach ($f in $files) {
  $images += [System.Drawing.Image]::FromFile($f)
}
try {
  $totalW = 0
  $maxH = 0
  foreach ($img in $images) {
    $totalW += [int]$img.Width
    if ([int]$img.Height -gt $maxH) { $maxH = [int]$img.Height }
  }
  if ($totalW -le 0 -or $maxH -le 0) { throw 'Invalid stitch dimensions' }
  $maxEdge = ${MAX_STITCH_EDGE_PX}
  $scale = 1.0
  if ($totalW -gt $maxEdge -or $maxH -gt $maxEdge) {
    $scale = [Math]::Min($maxEdge / [double]$totalW, $maxEdge / [double]$maxH)
  }
  $canvasW = [Math]::Max(1, [int][Math]::Round($totalW * $scale))
  $canvasH = [Math]::Max(1, [int][Math]::Round($maxH * $scale))
  $bmp = New-Object System.Drawing.Bitmap $canvasW, $canvasH
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::FromArgb(255, 16, 16, 16))
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $x = 0
  foreach ($img in $images) {
    $dw = [Math]::Max(1, [int][Math]::Round($img.Width * $scale))
    $dh = [Math]::Max(1, [int][Math]::Round($img.Height * $scale))
    $y = [Math]::Max(0, [int](($canvasH - $dh) / 2))
    $g.DrawImage($img, $x, $y, $dw, $dh)
    $x += $dw
  }
  $bmp.Save('${outFile.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
} finally {
  foreach ($img in $images) { $img.Dispose() }
}
`.trim();

    fs.writeFileSync(scriptPath, ps, 'utf8');
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      { timeout: 60000, windowsHide: true },
    );

    if (!fs.existsSync(outFile)) {
      throw new Error('Windows GDI stitch produced no output file');
    }
    const buffer = fs.readFileSync(outFile);
    if (!buffer.length) {
      throw new Error('Windows GDI stitch produced empty buffer');
    }
    console.log(`[MULTI-DISPLAY] Windows GDI stitch ok (${buffer.length} bytes, ${sorted.length} panes)`);
    return buffer;
  } finally {
    try {
      for (const f of fs.readdirSync(tmpDir)) {
        try { fs.unlinkSync(path.join(tmpDir, f)); } catch (_) {}
      }
      fs.rmdirSync(tmpDir);
    } catch (_) {}
  }
}

function layoutsMatchCaptureSizes(layouts, metas) {
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

function getElectronLayouts() {
  try {
    const { screen } = require('electron');
    if (!screen || typeof screen.getAllDisplays !== 'function') return null;

    const primary = screen.getPrimaryDisplay();
    const others = screen
      .getAllDisplays()
      .filter((d) => d.id !== primary.id)
      .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);

    const ordered = [primary, ...others];
    return ordered.map((d) => {
      const sf = d.scaleFactor || 1;
      return {
        id: d.id,
        x: Math.round(d.bounds.x * sf),
        y: Math.round(d.bounds.y * sf),
        width: Math.round(d.size.width * sf),
        height: Math.round(d.size.height * sf),
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
 * desktopCapturer: stitch all screen thumbnails into one image.
 * @param {{ width: number, height: number }} thumbnailSize
 */
async function captureViaDesktopCapturerStitched(thumbnailSize) {
  const { desktopCapturer } = require('electron');
  if (!desktopCapturer || typeof desktopCapturer.getSources !== 'function') {
    throw new Error('desktopCapturer unavailable');
  }

  const preferred = thumbnailSize || getPreferredThumbnailSize();
  // Large thumbnails sometimes drop secondary monitors on Windows DPI setups —
  // try preferred size first, then a safer mid-size.
  const sizesToTry = [
    preferred,
    { width: Math.min(preferred.width || 1920, 1920), height: Math.min(preferred.height || 1080, 1080) },
    { width: 1280, height: 720 },
  ];

  let withImages = [];
  let usedSize = preferred;
  for (const size of sizesToTry) {
    usedSize = size;
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: size,
      fetchWindowIcons: false,
    });
    withImages = (sources || []).filter((s) => s?.thumbnail && !s.thumbnail.isEmpty());
    console.log(
      `[MULTI-DISPLAY] desktopCapturer sources=${(sources || []).length}, withImages=${withImages.length}, size=${size.width}x${size.height}`,
    );
    if (withImages.length >= 2) break;
  }

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
      displayCount: 1,
    };
  }

  const layouts = getElectronLayouts() || [];
  const ordered = withImages.slice().sort((a, b) => {
    const ai = layouts.findIndex((l) => String(l.id) === String(a.display_id));
    const bi = layouts.findIndex((l) => String(l.id) === String(b.display_id));
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    // Fallback: parse screen:N:M ids
    const an = Number(String(a.id || '').split(':')[1] || 0);
    const bn = Number(String(b.id || '').split(':')[1] || 0);
    return an - bn;
  });

  const captures = uniqueCaptureBuffers(
    ordered.map((s, i) => ({
      id: s.display_id || i,
      primary: i === 0 || (layouts[0] && String(s.display_id) === String(layouts[0].id)),
      buffer: s.thumbnail.toPNG(),
    })),
  );

  let sawPrimary = false;
  for (const c of captures) {
    if (c.primary && !sawPrimary) {
      sawPrimary = true;
    } else if (c.primary) {
      c.primary = false;
    }
  }
  if (!sawPrimary && captures.length) captures[0].primary = true;

  if (captures.length < 2) {
    return {
      success: true,
      buffer: captures[0].buffer,
      method: 'desktopCapturer',
      displayCount: 1,
    };
  }

  const buffer = await stitchCaptures(captures);
  return {
    success: true,
    buffer,
    method: 'desktopCapturer-stitched',
    displayCount: captures.length,
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
  captureViaMacScreencaptureDashD,
  captureViaMacScreencaptureMultiFile,
  captureViaWindowsPowerShellAllScreens,
  captureViaPlatformNativeAllScreens,
  stitchCaptures,
  stitchCapturesViaWindowsGdi,
  annotateMultiDisplayResult,
  getPreferredThumbnailSize,
  getElectronDisplayCount,
};
