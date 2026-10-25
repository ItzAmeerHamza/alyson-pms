/**
 * The request timeout must also cover the body read (undici would otherwise
 * wait 300 s on a stalled body after headers arrive).
 */
const { callDesktopAction } = require('../backend-time-logs');

function stalledBodyFetch() {
  return jest.fn((url, opts) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        new Promise((_, reject) => {
          opts.signal.addEventListener('abort', () => {
            const e = new Error('aborted');
            e.name = 'AbortError';
            reject(e);
          });
        }),
      text: () => Promise.resolve(''),
    }),
  );
}

describe('body read is bounded by the request timeout', () => {
  afterEach(() => jest.useRealTimers());

  it('callDesktopAction rejects with a timeout when the body stalls', async () => {
    jest.useFakeTimers();
    global.fetch = stalledBodyFetch();
    const p = callDesktopAction('ping', {}, { backend_api_url: 'https://x.invalid', backend_api_key: 'k' }, { timeoutMs: 3000 });
    const assertion = expect(p).rejects.toThrow(/Backend sync timeout after 3000ms \(ping\)/);
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(3000);
    await assertion;
  });

  it('callDesktopAction still treats an unparsable (non-timeout) body as {}', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } }));
    await expect(
      callDesktopAction('ping', {}, { backend_api_url: 'https://x.invalid', backend_api_key: 'k' }),
    ).resolves.toEqual({});
  });
});
