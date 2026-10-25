const { AutomatedClickDetector } = require('../automated-click-detector');

// Deterministic pseudo-random so the "human" runs are repeatable.
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

function clicks(d, startMs, gaps, opts) {
  let ts = startMs;
  const out = [];
  for (const g of gaps) {
    ts += g;
    out.push(d.recordClick(ts, opts));
  }
  return { results: out, endMs: ts };
}

describe('automated click detection', () => {
  it("flags Garima's pattern: one click every ~7 s, mouse never moving (from the 30th click on)", () => {
    const d = new AutomatedClickDetector();
    const r = rng(1);
    const { results } = clicks(d, 0, Array.from({ length: 60 }, () => 7060 + (r() - 0.5) * 200));
    expect(results.slice(0, 29).every((x) => x === false)).toBe(true); // first 29 still count
    expect(results.slice(29).every((x) => x === true)).toBe(true);
    expect(d.automatedClicks).toBe(31);
  });

  it("flags Bhupen's pattern: ~15 clicks/min for hours", () => {
    const d = new AutomatedClickDetector();
    const { results } = clicks(d, 0, Array.from({ length: 200 }, (_, i) => 4000 + (i % 3) * 40));
    expect(results.filter(Boolean).length).toBe(171);
  });

  it('never flags real clicking with normal human rhythm, even with the mouse still', () => {
    const r = rng(42);
    for (let run = 0; run < 200; run++) {
      const d = new AutomatedClickDetector();
      // ±30% around 4 s
      const { results } = clicks(d, 0, Array.from({ length: 150 }, () => 4000 * (0.7 + r() * 0.6)));
      expect(results.some(Boolean)).toBe(false);
    }
  });

  it('never flags perfectly even clicking when the mouse moves between clicks', () => {
    const d = new AutomatedClickDetector();
    let ts = 0;
    for (let i = 0; i < 100; i++) {
      ts += 2000;
      d.recordMove(ts - 1000);
      expect(d.recordClick(ts)).toBe(false);
    }
  });

  it('double-clicks and long pauses do not form a run', () => {
    const d = new AutomatedClickDetector();
    let ts = 0;
    for (let i = 0; i < 80; i++) {
      ts += i % 2 ? 150 : 3000; // double-click pairs
      expect(d.recordClick(ts)).toBe(false);
    }
    const d2 = new AutomatedClickDetector();
    clicks(d2, 0, Array.from({ length: 20 }, () => 5000));
    const { results } = clicks(d2, 300_000, Array.from({ length: 20 }, () => 5000)); // 5 min pause
    expect(results.some(Boolean)).toBe(false);
  });

  it('the Windows "injected" flag alone never marks a click automated', () => {
    const d = new AutomatedClickDetector();
    const r = rng(7);
    const { results } = clicks(d, 0, Array.from({ length: 100 }, () => 3000 * (0.6 + r() * 0.8)), { injected: true });
    expect(results.some(Boolean)).toBe(false);
    expect(d.injectedEvents).toBe(100);
  });

  it('while automation runs, idle is time since the last real input', () => {
    const d = new AutomatedClickDetector();
    d.recordKey(0);
    const { endMs } = clicks(d, 0, Array.from({ length: 120 }, () => 7000)); // 14 min of clicking
    expect(d.isActive(endMs)).toBe(true);
    // Only the first 29 clicks were real; the last of them is ~3.4 min in.
    expect(d.realInputIdleSeconds(endMs)).toBe((endMs - 29 * 7000) / 1000);
    d.recordMove(endMs + 1000);
    expect(d.realInputIdleSeconds(endMs + 1000)).toBe(0);
    expect(d.realInputIdleSeconds(endMs + 120_000)).toBeNull(); // run over → use OS idle again
  });

  it('with no automation, idle is left to the OS figure', () => {
    const d = new AutomatedClickDetector();
    clicks(d, 0, [1000, 2500, 900, 4000]);
    expect(d.realInputIdleSeconds(10_000)).toBeNull();
  });
});
