jest.mock('electron', () => ({
  ipcMain: { handle: jest.fn() },
}));

const { ipcMain } = require('electron');

describe('MainCredentialHandler', () => {
  const originalType = process.type;

  beforeEach(() => {
    ipcMain.handle.mockClear();
    process.type = 'browser';
  });

  afterEach(() => {
    process.type = originalType;
  });

  it('registers get-credentials even when keytar is missing', () => {
    jest.isolateModules(() => {
      jest.doMock('keytar', () => {
        throw new Error('native module missing');
      });
      const MainCredentialHandler = require('../main-credential-handler');
      new MainCredentialHandler();
    });

    const channels = ipcMain.handle.mock.calls.map(([channel]) => channel);
    expect(channels).toContain('get-credentials');
    expect(channels).toContain('save-credentials');
  });
});
