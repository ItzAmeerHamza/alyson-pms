const { createJsonLineReader } = require('../../../cross-platform-input-detector');

const flush = () => new Promise((r) => setImmediate(r));
async function drainAll() { for (let i = 0; i < 50; i++) await flush(); }

function makeReader(accepting = { on: true }) {
  const events = [];
  const bad = [];
  const onData = createJsonLineReader({
    isAccepting: () => accepting.on,
    onEvent: (e) => events.push(e),
    onBadLine: (l) => bad.push(l),
    batchSize: 3,
  });
  return { events, bad, onData, accepting };
}

describe('helper stdout line reader', () => {
  it('counts every event once when chunks arrive while a batch is in progress', async () => {
    const { events, onData } = makeReader();
    const line = (n) => JSON.stringify({ type: 'key', n }) + '\n';
    onData(Buffer.from(line(1) + line(2) + line(3) + line(4)));
    onData(Buffer.from(line(5) + line(6))); // used to be dropped
    onData(Buffer.from(line(7)));
    await drainAll();
    expect(events.map((e) => e.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('joins a line split across two chunks', async () => {
    const { events, bad, onData } = makeReader();
    const full = JSON.stringify({ type: 'click', n: 1 });
    onData(Buffer.from(full.slice(0, 7)));
    onData(Buffer.from(full.slice(7) + '\n'));
    await drainAll();
    expect(events).toEqual([{ type: 'click', n: 1 }]);
    expect(bad).toEqual([]);
  });

  it('never invents events: noise lines are skipped, not counted', async () => {
    const { events, bad, onData } = makeReader();
    onData(Buffer.from('starting up\n{"type":"key"}\n\n'));
    await drainAll();
    expect(events).toEqual([{ type: 'key' }]);
    expect(bad).toEqual(['starting up']);
  });

  it('counts nothing once stopped, including lines queued before Stop', async () => {
    const { events, onData, accepting } = makeReader();
    onData(Buffer.from('{"n":1}\n{"n":2}\n{"n":3}\n{"n":4}\n{"n":5}\n'));
    accepting.on = false;
    onData(Buffer.from('{"n":6}\n'));
    await drainAll();
    expect(events).toEqual([]);
  });
});
