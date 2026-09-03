/**
 * A hanging GitHub/update check must not freeze the login screen.
 */

const UIManager = require('../ui-manager');

describe('enforceMandatoryUpdateGateAtStartup', () => {
  const prev = process.env.UPDATE_GATE_TIMEOUT_MS;

  afterEach(() => {
    if (prev == null) delete process.env.UPDATE_GATE_TIMEOUT_MS;
    else process.env.UPDATE_GATE_TIMEOUT_MS = prev;
    delete global.window;
  });

  it('returns false when the update IPC never resolves', async () => {
    process.env.UPDATE_GATE_TIMEOUT_MS = '40';
    global.window = {};
    const ipcRenderer = {
      invoke: jest.fn(() => new Promise(() => {})),
    };
    const ui = new UIManager(ipcRenderer, { showNotification: jest.fn() });
    ui.showMandatoryUpdateGate = jest.fn();

    const blocked = await ui.enforceMandatoryUpdateGateAtStartup();

    expect(blocked).toBe(false);
    expect(ui.showMandatoryUpdateGate).not.toHaveBeenCalled();
    expect(global.window.__updateGateActive).toBe(false);
  }, 3000);
});
