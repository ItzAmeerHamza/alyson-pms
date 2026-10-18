const fs = require('fs');
const path = require('path');

const mockOpenExternal = jest.fn(async () => undefined);
const mockHandle = jest.fn();

jest.mock(
  'electron',
  () => ({
    ipcMain: { handle: mockHandle, removeHandler: jest.fn() },
    shell: { openExternal: mockOpenExternal },
  }),
  { virtual: true },
);

const IPCEventMap = require('../ipc-event-map');

describe('open-external-url (sidebar Dashboard button)', () => {
  let handler;

  beforeEach(() => {
    mockOpenExternal.mockClear();
    const map = new IPCEventMap();
    map.registerHandlers();
    handler = map.handlers.get('open-external-url');
  });

  it('opens https://app.tavilo.ai/ in the system browser', async () => {
    const result = await handler({}, { url: 'https://app.tavilo.ai/' });
    expect(result).toEqual({ success: true });
    expect(mockOpenExternal).toHaveBeenCalledWith('https://app.tavilo.ai/');
  });

  it('opens the bare host too', async () => {
    const result = await handler({}, { url: 'https://app.tavilo.ai' });
    expect(result.success).toBe(true);
    expect(mockOpenExternal).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the retired host', 'https://app.alyson.ai'],
    ['plain http', 'http://app.tavilo.ai/'],
    ['a look-alike host', 'https://app.tavilo.ai.evil.example/'],
    ['a subdomain trick', 'https://evil.example/?u=app.tavilo.ai'],
    ['a non-web scheme', 'file:///etc/passwd'],
    ['garbage', 'not a url'],
    ['nothing', undefined],
  ])('refuses %s', async (_label, url) => {
    const result = await handler({}, { url });
    expect(result.success).toBe(false);
    expect(mockOpenExternal).not.toHaveBeenCalled();
  });

  it('the Dashboard nav item in index.html points at a URL this handler accepts', async () => {
    const html = fs.readFileSync(
      path.join(__dirname, '../../../../renderer/index.html'),
      'utf8',
    );
    const match = html.match(
      /<div class="nav-item nav-item-external" data-page="dashboard" data-external-url="([^"]+)"/,
    );
    expect(match).not.toBeNull();
    expect(match[1]).toBe('https://app.tavilo.ai/');

    const result = await handler({}, { url: match[1] });
    expect(result.success).toBe(true);
    expect(mockOpenExternal).toHaveBeenCalledWith('https://app.tavilo.ai/');
  });
});
