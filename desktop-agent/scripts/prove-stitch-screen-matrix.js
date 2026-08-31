#!/usr/bin/env node
/**
 * Runs stitchCaptures against every setup in stitch-screen-matrix.js.
 * Usage: node desktop-agent/scripts/prove-stitch-screen-matrix.js
 */

const Module = require('module');
const path = require('path');
const sharp = require('sharp');
const { buildCases, MAX_STITCH_EDGE_PX } = require('../src/modules/utils/__tests__/stitch-screen-matrix');

const electron = {
  screen: {
    displays: [],
    primary: null,
    getAllDisplays() {
      return this.displays;
    },
    getPrimaryDisplay() {
      return this.primary;
    },
  },
  desktopCapturer: { getSources: async () => [] },
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return electron;
  if (request === 'screenshot-desktop') {
    const fn = async () => Buffer.from('x');
    fn.listDisplays = async () => [];
    fn.all = async () => [];
    return fn;
  }
  return origLoad.apply(this, arguments);
};

const { stitchCaptures } = require('../src/modules/utils/multi-display-screenshot');

async function makePane(w, h, r, g, b) {
  return sharp({
    create: { width: w, height: h, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer();
}

function setDisplays(displays, primaryId) {
  electron.screen.displays = displays;
  electron.screen.primary = displays.find((disp) => disp.id === primaryId) || displays[0];
}

async function assertStitch(c) {
  setDisplays(c.displays, c.primary);
  const colors = [
    [220, 40, 40],
    [40, 40, 220],
    [40, 180, 40],
    [220, 180, 40],
  ];
  const captures = [];
  for (let i = 0; i < c.panes.length; i++) {
    const pane = c.panes[i];
    const [r, g, b] = colors[i % colors.length];
    captures.push({
      id: c.displays[i].id,
      primary: c.displays[i].id === c.primary,
      buffer: await makePane(pane.w, pane.h, r, g, b),
    });
  }

  const t0 = Date.now();
  const buffer = await stitchCaptures(captures);
  const ms = Date.now() - t0;
  if (!buffer || buffer.length < 500) {
    throw new Error('empty/tiny buffer');
  }
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) throw new Error('missing output dimensions');
  if (meta.width > MAX_STITCH_EDGE_PX + 2 || meta.height > MAX_STITCH_EDGE_PX + 2) {
    throw new Error(`output ${meta.width}x${meta.height} exceeds ${MAX_STITCH_EDGE_PX}`);
  }
  const maxPaneW = Math.max(...c.panes.map((p) => p.w));
  const maxPaneH = Math.max(...c.panes.map((p) => p.h));
  if (meta.width < 64 || meta.height < 64) {
    throw new Error(`output collapsed to ${meta.width}x${meta.height}`);
  }
  if (c.panes.length >= 2 && meta.width < 100 && meta.height < 100) {
    throw new Error('multi-pane output too small');
  }
  return {
    width: meta.width,
    height: meta.height,
    bytes: buffer.length,
    ms,
    maxPane: `${maxPaneW}x${maxPaneH}`,
  };
}

(async () => {
  const cases = buildCases();
  let failed = 0;
  console.log(`Stitch screen matrix: ${cases.length} cases\n`);
  for (const c of cases) {
    try {
      const out = await assertStitch(c);
      console.log(
        `OK  ${c.name}\n    panes=${c.panes.map((p) => `${p.w}x${p.h}`).join(' + ')} → ${out.width}x${out.height} ${out.bytes}b ${out.ms}ms`,
      );
    } catch (err) {
      failed += 1;
      console.error(`FAIL ${c.name}\n    ${err.message || err}`);
    }
  }

  try {
    await stitchCaptures([{ id: 1, primary: true, buffer: await makePane(100, 80, 1, 2, 3) }]);
    failed += 1;
    console.error('FAIL single pane should throw');
  } catch (err) {
    if (/at least 2/i.test(String(err.message))) {
      console.log('OK  single pane rejected');
    } else {
      failed += 1;
      console.error(`FAIL single pane threw unexpected: ${err.message}`);
    }
  }

  console.log(failed ? `\n${failed} FAILED` : `\nALL ${cases.length + 1} CHECKS PASSED`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
