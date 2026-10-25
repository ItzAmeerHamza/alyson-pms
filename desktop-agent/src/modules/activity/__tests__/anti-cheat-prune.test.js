jest.mock('electron', () => ({ powerMonitor: { getSystemIdleTime: () => 0 } }), { virtual: true });
jest.mock('child_process', () => ({ execSync: jest.fn(), exec: jest.fn(), execFile: jest.fn() }));

const AntiCheatDetector = require('../anti-cheat-detector');
const { execFile } = require('child_process');

/** Reference: the old per-event filter. */
function referenceRun(events) {
  const s = { moves: [], clicks: [], clickPos: [], keys: [], keyTs: [] };
  for (const { type, t, data } of events) {
    if (type === 'mouse_move') {
      s.moves.push({ ...data, timestamp: t });
      const c = t - 2 * 60 * 1000;
      s.moves = s.moves.filter((m) => m.timestamp > c);
    } else if (type === 'mouse_click') {
      s.clicks.push(t);
      if (data && (data.x !== undefined || data.position)) {
        const pos = data.position || { x: data.x, y: data.y };
        s.clickPos.push({ ...pos, timestamp: t });
      }
      const c = t - 10 * 60 * 1000;
      s.clicks = s.clicks.filter((x) => x > c);
      s.clickPos = s.clickPos.filter((x) => x.timestamp > c);
    } else if (type === 'keyboard') {
      s.keys.push({ ...data, timestamp: t });
      s.keyTs.push(t);
      const c = t - 5 * 60 * 1000;
      s.keys = s.keys.filter((k) => k.timestamp > c);
      s.keyTs = s.keyTs.filter((x) => x > c);
    }
  }
  return s;
}

function run(events) {
  const d = new AntiCheatDetector({});
  const realNow = Date.now;
  try {
    for (const e of events) {
      Date.now = () => e.t;
      d.recordActivity(e.type, e.data);
    }
  } finally {
    Date.now = realNow;
  }
  return {
    moves: d.recentMouseMoves,
    clicks: d.mouseClickTimestamps,
    clickPos: d.mouseClickPositions,
    keys: d.recentKeyPresses,
    keyTs: d.keyboardTimestamps,
  };
}

function makeEvents(n, seed, { clockJumps = false } = {}) {
  let x = seed;
  const rnd = () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
  const types = ['mouse_move', 'mouse_click', 'keyboard'];
  let t = 1_700_000_000_000;
  const events = [];
  for (let i = 0; i < n; i += 1) {
    if (clockJumps && rnd() < 0.01) t -= Math.floor(rnd() * 15 * 60 * 1000);
    else t += Math.floor(rnd() * (rnd() < 0.02 ? 20 * 60 * 1000 : 3000));
    const type = types[Math.floor(rnd() * 3)];
    const data = type === 'keyboard' ? { key: 'a' } : { x: Math.floor(rnd() * 1000), y: 5 };
    events.push({ type, t, data });
  }
  return events;
}

describe('anti-cheat in-place pruning', () => {
  it('matches the old filter for in-order timestamps', () => {
    for (const seed of [1, 7, 42]) {
      const events = makeEvents(4000, seed);
      expect(run(events)).toEqual(referenceRun(events));
    }
  });

  it('matches the old filter when the wall clock goes backwards', () => {
    for (const seed of [3, 11, 99]) {
      const events = makeEvents(4000, seed, { clockJumps: true });
      expect(run(events)).toEqual(referenceRun(events));
    }
  });

  it('mac USB scan runs system_profiler without a shell and greps the same lines', async () => {
    const d = new AntiCheatDetector({});
    execFile.mockImplementation((file, args, opts, cb) =>
      cb(null, 'USB:\n\n    USB 3.1 Bus:\n      Host Controller Driver: AppleT8112\n        Product ID: 0x1234\n        Vendor ID: 0x05ac\n        Speed: Up to 480 Mb/s\n        nothing here\n', ''),
    );
    const devices = await d.getMacUSBDevices();
    expect(execFile.mock.calls[0][0]).toBe('system_profiler');
    expect(execFile.mock.calls[0][1]).toEqual(['SPUSBDataType']);
    expect(execFile.mock.calls[0][2].killSignal).toBe('SIGKILL');
    expect(devices).toEqual(['USB:', 'USB 3.1 Bus:', 'Host Controller Driver: AppleT8112', 'Speed: Up to 480 Mb/s']);
  });

  it('mac USB scan: no matching lines or a killed child → []', async () => {
    const d = new AntiCheatDetector({});
    execFile.mockImplementationOnce((file, args, opts, cb) => cb(null, 'nothing\n', ''));
    await expect(d.getMacUSBDevices()).resolves.toEqual([]);
    const killed = Object.assign(new Error('timeout'), { killed: true, signal: 'SIGKILL' });
    execFile.mockImplementationOnce((file, args, opts, cb) => cb(killed, 'Vendor: x\n', ''));
    await expect(d.getMacUSBDevices()).resolves.toEqual([]);
  });
});
