/**
 * Real Electron verification for dual/multi-monitor screenshots.
 *
 * Usage:
 *   npm run verify:multi-display
 *
 * Exit codes:
 *   0 = PASS (or SKIP when only 1 display is connected)
 *   1 = FAIL (Electron sees 2+ displays but capture returned fewer)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, screen, desktopCapturer } = require('electron');

async function main() {
  await app.whenReady();

  const OUT_DIR = path.join(app.getPath('temp'), 'alyson-multi-display-verify');
  const OUT_FILE = path.join(OUT_DIR, `stitched-${Date.now()}.png`);

  const displays = screen.getAllDisplays();
  const electronCount = displays.length;
  console.log('=== MULTI-DISPLAY VERIFY ===');
  console.log('platform:', process.platform);
  console.log('electronDisplayCount:', electronCount);
  displays.forEach((d, i) => {
    console.log(`  display[${i}] id=${d.id} ${d.size.width}x${d.size.height} @${d.scaleFactor} bounds=${JSON.stringify(d.bounds)} primary=${d.id === screen.getPrimaryDisplay().id}`);
  });

  let capturerSources = [];
  try {
    capturerSources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: false,
    });
  } catch (e) {
    console.warn('desktopCapturer.getSources failed:', e.message);
  }
  console.log(
    'desktopCapturerSources:',
    capturerSources.map((s) => ({ id: s.id, display_id: s.display_id, name: s.name, empty: s.thumbnail?.isEmpty?.() })),
  );

  const {
    captureAllDisplaysStitched,
    getElectronDisplayCount,
  } = require('../src/modules/utils/multi-display-screenshot');

  console.log('getElectronDisplayCount():', getElectronDisplayCount());
  const result = await captureAllDisplaysStitched();

  const summary = {
    electronCount,
    capturerSourceCount: capturerSources.length,
    success: !!result.success,
    displayCount: result.displayCount || 0,
    expectedDisplayCount: result.expectedDisplayCount || electronCount,
    incompleteMultiDisplay: !!result.incompleteMultiDisplay,
    method: result.method || null,
    bytes: result.buffer?.length || 0,
    error: result.error || null,
    proofFile: null,
  };

  if (result.success && result.buffer?.length) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, result.buffer);
    summary.proofFile = OUT_FILE;
  }

  console.log('RESULT:', JSON.stringify(summary, null, 2));

  if (electronCount >= 2) {
    const ok =
      summary.success &&
      summary.displayCount >= 2 &&
      !summary.incompleteMultiDisplay;
    if (!ok) {
      console.error('FAIL: External/multi-monitor capture did not produce 2+ panes.');
      console.error('This is the bug employees hit — do NOT ship until this passes with a second monitor attached.');
      app.exit(1);
      return;
    }
    console.log('PASS: Dual/multi-monitor capture verified.');
    app.exit(0);
    return;
  }

  console.log('SKIP_ASSERT: Only 1 display connected on this machine.');
  console.log('Plug in an external monitor (Extended mode), re-run: npm run verify:multi-display');
  console.log('Single-display capture path exercised successfully =', summary.success);
  app.exit(summary.success ? 0 : 1);
}

main().catch((err) => {
  console.error('VERIFY CRASHED:', err);
  app.exit(1);
});
