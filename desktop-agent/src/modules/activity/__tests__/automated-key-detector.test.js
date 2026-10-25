const { AutomatedInputDetector } = require('../automated-click-detector');

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

describe('automated keystroke detection', () => {
  it("held key (Sameer, 22 Oct): repeats count for the first minute, not after", () => {
    const d = new AutomatedInputDetector();
    let ts = 0;
    d.recordKey(ts); // the press
    let counted = 0;
    let dropped = 0;
    for (let i = 0; i < 33 * 600; i++) { // 10 minutes of Windows auto-repeat
      ts += 30;
      if (d.recordKey(ts, { repeat: true })) dropped += 1;
      else counted += 1;
    }
    expect(counted).toBe(2000); // 60 s / 30 ms
    expect(dropped).toBe(33 * 600 - 2000);
    expect(d.isActive(ts)).toBe(true);
  });

  it('normal holds (backspace, arrows) count fully', () => {
    for (const seconds of [2, 10, 30, 59]) {
      const d = new AutomatedInputDetector();
      let ts = 0;
      d.recordKey(ts);
      for (let i = 0; i < seconds * 33; i++) {
        ts += 30;
        expect(d.recordKey(ts, { repeat: true })).toBe(false);
      }
    }
  });

  it('macOS: same key again within 150 ms is auto-repeat (no repeat flag there)', () => {
    const d = new AutomatedInputDetector();
    let ts = 0;
    let dropped = 0;
    for (let i = 0; i < 33 * 120; i++) {
      ts += 30;
      if (d.recordKey(ts, { keyId: 125 })) dropped += 1;
    }
    expect(dropped).toBeGreaterThan(33 * 55);
  });

  it('a held key ends when another key is pressed', () => {
    const d = new AutomatedInputDetector();
    let ts = 0;
    d.recordKey(ts);
    for (let i = 0; i < 1500; i++) { ts += 30; d.recordKey(ts, { repeat: true }); } // 45 s
    ts += 200;
    d.recordKey(ts); // different key
    for (let i = 0; i < 1500; i++) { ts += 30; expect(d.recordKey(ts, { repeat: true })).toBe(false); }
  });

  it('typing bot at a fixed speed is caught after 40 keys', () => {
    const d = new AutomatedInputDetector();
    let ts = 0;
    const out = [];
    for (let i = 0; i < 100; i++) { ts += 120; out.push(d.recordKey(ts, { keyId: i % 30 })); }
    expect(out.slice(0, 39).some(Boolean)).toBe(false);
    expect(out.slice(39).every(Boolean)).toBe(true);
  });

  it('key repeater (a key every 30 s) is caught', () => {
    const d = new AutomatedInputDetector();
    let ts = 0;
    let dropped = 0;
    for (let i = 0; i < 80; i++) { ts += 30_000; if (d.recordKey(ts, { keyId: 124 })) dropped += 1; }
    expect(dropped).toBe(41);
  });

  it('real typing is never flagged, even with the mouse still', () => {
    const r = rng(3);
    for (let run = 0; run < 100; run++) {
      const d = new AutomatedInputDetector();
      let ts = 0;
      for (let i = 0; i < 400; i++) {
        ts += 60 + r() * 300 + (r() < 0.05 ? 2000 * r() : 0); // bursts and pauses
        expect(d.recordKey(ts, { keyId: Math.floor(r() * 40) })).toBe(false);
      }
    }
  });

  it('while a held key runs, idle is time since the last real input', () => {
    const d = new AutomatedInputDetector();
    let ts = 0;
    d.recordKey(ts);
    for (let i = 0; i < 33 * 300; i++) { ts += 30; d.recordKey(ts, { repeat: true }); } // 5 min
    expect(d.realInputIdleSeconds(ts)).toBe(Math.floor((ts - 60_000) / 1000));
  });
});
