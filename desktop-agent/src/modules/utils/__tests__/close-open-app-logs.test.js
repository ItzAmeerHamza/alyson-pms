describe('closeOpenAppLogs close-all tracking', () => {
  const config = { backend_api_url: 'http://localhost:3000', backend_api_key: 'test-key' };
  let backend;
  let realFetch;

  beforeEach(() => {
    jest.resetModules();
    realFetch = global.fetch;
    backend = require('../backend-time-logs');
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  const respond = (ok, body, status = ok ? 200 : 500) => {
    global.fetch = jest.fn(async () => ({ ok, status, json: async () => body }));
  };

  it('records the time of a close-all but not of a single-app close', async () => {
    respond(true, { success: true, closed: 1 });

    await backend.closeOpenAppLogs({ user_id: '1195', ended_at: '2026-10-13T15:45:00.000Z', app_name: 'Slack' }, config);
    expect(backend.getLastAllAppLogsClosedAt()).toBe(0);

    await backend.closeOpenAppLogs({ user_id: '1195', ended_at: '2026-10-13T17:00:00.000Z' }, config);
    expect(backend.getLastAllAppLogsClosedAt()).toBe(Date.parse('2026-10-13T17:00:00.000Z'));
  });

  it('does not record a close-all that the backend rejected', async () => {
    respond(false, { message: 'Internal server error', code: '08P01' });

    await expect(
      backend.closeOpenAppLogs({ user_id: '1195', ended_at: '2026-10-13T17:00:00.000Z' }, config),
    ).rejects.toMatchObject({ message: 'Internal server error [08P01]', status: 500 });
    expect(backend.getLastAllAppLogsClosedAt()).toBe(0);
  });

  it('keeps the network cause on fetch failures', async () => {
    const cause = Object.assign(new Error('getaddrinfo ENOTFOUND api.example.com'), { code: 'ENOTFOUND' });
    global.fetch = jest.fn(async () => { throw new TypeError('fetch failed', { cause }); });

    await expect(
      backend.closeOpenAppLogs({ user_id: '1195' }, config),
    ).rejects.toMatchObject({ message: 'fetch failed', cause: { cause: { code: 'ENOTFOUND' } } });
  });
});
