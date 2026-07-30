/**
 * Offline proof (no second monitor required):
 * When Electron reports 2 displays but screenshot-desktop listDisplays returns 1,
 * captureAllDisplaysStitched must still return displayCount=2 via desktopCapturer.
 *
 * Exit 0 on PASS, 1 on FAIL.
 */

const sharp = require('sharp');
const path = require('path');

async function makePng(w, h, r, g, b) {
  return sharp({
    create: { width: w, height: h, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer();
}

async function main() {
  const electronMock = {
    screen: {
      getAllDisplays: () => [
        {
          id: 11,
          bounds: { x: 0, y: 0, width: 100, height: 50 },
          size: { width: 100, height: 50 },
          scaleFactor: 1,
        },
        {
          id: 22,
          bounds: { x: 100, y: 0, width: 120, height: 60 },
          size: { width: 120, height: 60 },
          scaleFactor: 1,
        },
      ],
      getPrimaryDisplay: () => ({
        id: 11,
        bounds: { x: 0, y: 0, width: 100, height: 50 },
        size: { width: 100, height: 50 },
        scaleFactor: 1,
      }),
    },
    desktopCapturer: {
      getSources: async () => {
        const a = await makePng(100, 50, 255, 0, 0);
        const b = await makePng(120, 60, 0, 0, 255);
        return [
          {
            id: 'screen:0:0',
            display_id: '11',
            name: 'Built-in',
            thumbnail: { isEmpty: () => false, toPNG: () => a },
          },
          {
            id: 'screen:1:0',
            display_id: '22',
            name: 'External',
            thumbnail: { isEmpty: () => false, toPNG: () => b },
          },
        ];
      },
    },
  };

  // screenshot-desktop under-reports (the historical Mac bug)
  const screenshotMock = Object.assign(
    async () => makePng(100, 50, 10, 10, 10),
    {
      listDisplays: async () => [{ id: 0, name: 'Built-in', primary: true }],
      all: async () => [await makePng(100, 50, 10, 10, 10)],
    },
  );

  require.cache[require.resolve('electron')] = {
    id: 'electron',
    filename: 'electron',
    loaded: true,
    exports: electronMock,
  };
  require.cache[require.resolve('screenshot-desktop')] = {
    id: 'screenshot-desktop',
    filename: 'screenshot-desktop',
    loaded: true,
    exports: screenshotMock,
  };

  // Load after mocks
  const modPath = path.join(__dirname, '../src/modules/utils/multi-display-screenshot.js');
  delete require.cache[require.resolve(modPath)];
  const multi = require(modPath);

  if (multi.getElectronDisplayCount() !== 2) {
    throw new Error(`expected electron count 2, got ${multi.getElectronDisplayCount()}`);
  }

  const result = await multi.captureAllDisplaysStitched();
  console.log('PROOF RESULT', {
    success: result.success,
    displayCount: result.displayCount,
    method: result.method,
    incompleteMultiDisplay: result.incompleteMultiDisplay,
    bytes: result.buffer?.length,
  });

  if (!result.success) throw new Error('capture failed');
  if ((result.displayCount || 0) < 2) {
    throw new Error(
      `FAIL: under-reported listDisplays caused single-display capture (got ${result.displayCount})`,
    );
  }
  if (result.incompleteMultiDisplay) {
    throw new Error('FAIL: incompleteMultiDisplay unexpectedly true');
  }

  const meta = await sharp(result.buffer).metadata();
  console.log('stitched dimensions', meta.width, 'x', meta.height);
  if ((meta.width || 0) < 150) {
    throw new Error(`FAIL: stitched image not wide enough (${meta.width})`);
  }

  console.log('PASS: Dual capture works even when listDisplays returns only 1 monitor.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
