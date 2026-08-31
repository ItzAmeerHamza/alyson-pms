const CredentialManager = require('../credential-manager');

describe('CredentialManager IPC race', () => {
  it('retries get-credentials until the main handler is registered', async () => {
    const invoke = jest
      .fn()
      .mockRejectedValueOnce(new Error("No handler registered for 'get-credentials'"))
      .mockResolvedValueOnce({ email: 'aryan@cintara.ai', password: 'x' });

    const mgr = new CredentialManager();
    mgr.useIPC = true;
    mgr.ipcRenderer = { invoke };

    const creds = await mgr.getCredentials('aryan@cintara.ai');

    expect(creds).toEqual({ email: 'aryan@cintara.ai', password: 'x' });
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
