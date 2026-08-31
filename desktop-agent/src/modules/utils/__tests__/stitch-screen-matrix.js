/**
 * Display setups used to lock the multi-monitor stitch.
 * `capturerThumbs` matches Electron desktopCapturer: every pane is the max request size.
 */

function d(id, x, y, w, h, sf = 1) {
  return {
    id,
    bounds: { x, y, width: w, height: h },
    size: { width: w, height: h },
    scaleFactor: sf,
  };
}

function physicalPanes(displays) {
  return displays.map((disp) => ({
    w: Math.round(disp.size.width * (disp.scaleFactor || 1)),
    h: Math.round(disp.size.height * (disp.scaleFactor || 1)),
  }));
}

function capturerThumbs(displays) {
  const phys = physicalPanes(displays);
  const w = Math.min(3840, Math.max(1920, ...phys.map((p) => p.w)));
  const h = Math.min(2160, Math.max(1080, ...phys.map((p) => p.h)));
  return phys.map(() => ({ w, h }));
}

const DISPLAY_SETS = [
  {
    name: 'Hanan: 14" Retina + 3440 ultrawide (mixed DPI)',
    displays: [d(1, 0, 0, 1512, 982, 2), d(2, 1512, -229, 3440, 1440, 1)],
    primary: 1,
  },
  {
    name: 'Hanan flipped: ultrawide primary, laptop on the left',
    displays: [d(2, 0, 0, 3440, 1440, 1), d(1, -1512, 229, 1512, 982, 2)],
    primary: 2,
  },
  {
    name: 'two 1080p @1x side-by-side (Windows / matching Mac)',
    displays: [d(1, 0, 0, 1920, 1080, 1), d(2, 1920, 0, 1920, 1080, 1)],
    primary: 1,
  },
  {
    name: 'two 1440p @1x',
    displays: [d(1, 0, 0, 2560, 1440, 1), d(2, 2560, 0, 2560, 1440, 1)],
    primary: 1,
  },
  {
    name: 'two 4K @1x (canvas hits 3840 cap)',
    displays: [d(1, 0, 0, 3840, 2160, 1), d(2, 3840, 0, 3840, 2160, 1)],
    primary: 1,
  },
  {
    name: 'two 5K @1x (must scale under 3840)',
    displays: [d(1, 0, 0, 5120, 2880, 1), d(2, 5120, 0, 5120, 2880, 1)],
    primary: 1,
  },
  {
    name: 'MacBook 16" @2x + 1080p',
    displays: [d(1, 0, 0, 1728, 1117, 2), d(2, 1728, 0, 1920, 1080, 1)],
    primary: 1,
  },
  {
    name: 'MacBook 13" @2x + 1440p',
    displays: [d(1, 0, 0, 1280, 800, 2), d(2, 1280, 0, 2560, 1440, 1)],
    primary: 1,
  },
  {
    name: 'iMac 24" @2x + 4K @1x',
    displays: [d(1, 0, 0, 2240, 1260, 2), d(2, 2240, 0, 3840, 2160, 1)],
    primary: 1,
  },
  {
    name: 'laptop @2x + 4K @2x (both retina)',
    displays: [d(1, 0, 0, 1512, 982, 2), d(2, 1512, 0, 1920, 1080, 2)],
    primary: 1,
  },
  {
    name: 'Windows 150% + 100% (scale 1.5 / 1)',
    displays: [d(1, 0, 0, 1920, 1080, 1.5), d(2, 1920, 0, 1920, 1080, 1)],
    primary: 1,
  },
  {
    name: 'Windows 125% + 100%',
    displays: [d(1, 0, 0, 1920, 1080, 1.25), d(2, 1920, 0, 2560, 1440, 1)],
    primary: 1,
  },
  {
    name: 'Windows 200% laptop + 100% 1080p',
    displays: [d(1, 0, 0, 1920, 1080, 2), d(2, 1920, 0, 1920, 1080, 1)],
    primary: 1,
  },
  {
    name: 'super ultrawide 5120×1440 + 1080p',
    displays: [d(1, 0, 0, 5120, 1440, 1), d(2, 5120, 0, 1920, 1080, 1)],
    primary: 1,
  },
  {
    name: 'portrait 1080×1920 + landscape 1920×1080',
    displays: [d(1, 0, 0, 1080, 1920, 1), d(2, 1080, 420, 1920, 1080, 1)],
    primary: 1,
  },
  {
    name: 'two portraits side-by-side',
    displays: [d(1, 0, 0, 1080, 1920, 1), d(2, 1080, 0, 1080, 1920, 1)],
    primary: 1,
  },
  {
    name: 'stacked vertically (second below)',
    displays: [d(1, 0, 0, 1920, 1080, 1), d(2, 0, 1080, 1920, 1080, 1)],
    primary: 1,
  },
  {
    name: 'tiny 800×600 + 3440 ultrawide',
    displays: [d(1, 0, 0, 800, 600, 1), d(2, 800, 0, 3440, 1440, 1)],
    primary: 1,
  },
  {
    name: 'mirrored origin (both x=0) — overlap',
    displays: [d(1, 0, 0, 1920, 1080, 1), d(2, 0, 0, 2560, 1440, 1)],
    primary: 1,
  },
  {
    name: 'triple 1080p same DPI',
    displays: [
      d(1, 0, 0, 1920, 1080, 1),
      d(2, 1920, 0, 1920, 1080, 1),
      d(3, 3840, 0, 1920, 1080, 1),
    ],
    primary: 1,
  },
  {
    name: 'triple mixed: Retina laptop + two 1080p',
    displays: [
      d(1, 0, 0, 1512, 982, 2),
      d(2, 1512, 0, 1920, 1080, 1),
      d(3, 3432, 0, 1920, 1080, 1),
    ],
    primary: 1,
  },
  {
    name: 'Aryan-like Windows dual 1080p @1x',
    displays: [d(1, 0, 0, 1920, 1080, 1), d(2, 1920, 0, 1920, 1080, 1)],
    primary: 1,
  },
];

const MAX_STITCH_EDGE_PX = 3840;

function buildCases() {
  const cases = [];
  for (const set of DISPLAY_SETS) {
    cases.push({
      name: `${set.name} [physical panes]`,
      displays: set.displays,
      primary: set.primary,
      panes: physicalPanes(set.displays),
    });
    cases.push({
      name: `${set.name} [desktopCapturer thumbs]`,
      displays: set.displays,
      primary: set.primary,
      panes: capturerThumbs(set.displays),
    });
  }
  return cases;
}

module.exports = {
  DISPLAY_SETS,
  MAX_STITCH_EDGE_PX,
  buildCases,
  physicalPanes,
  capturerThumbs,
};
