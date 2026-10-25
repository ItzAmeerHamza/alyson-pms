/**
 * Closing the window (X) must hide to tray and keep recording.
 * Only Stop / Quit / lid / idle-timeout close the session.
 */

jest.mock('../cleanup-registry', () => ({
  registerResource: jest.fn(),
  registerInterval: jest.fn(),
}));

const gsm = require('../graceful-shutdown-manager');

describe('window close keeps tracking', () => {
  afterEach(() => {
    delete global.isQuitting;
    delete global.isTracking;
    delete global.stopTracking;
    delete global.trayManager;
  });

  it('hides to tray and does not call stopTracking', () => {
    global.isQuitting = false;
    global.isTracking = true;
    global.stopTracking = jest.fn();
    const hide = jest.fn();
    const notify = jest.fn();
    const event = { preventDefault: jest.fn() };
    const win = { isDestroyed: () => false, hide };

    const intercepted = gsm.handleWindowCloseEvent(event, win, {
      showTrayNotification: notify,
      platform: 'darwin', // macOS: no prompt, X hides straight away
    });

    expect(intercepted).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(hide).toHaveBeenCalled();
    expect(global.stopTracking).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      'Tavilo Time',
      expect.stringMatching(/Still tracking/),
    );
  });

  it('lets a real quit proceed so the session can close', () => {
    global.isQuitting = true;
    global.stopTracking = jest.fn();
    const event = { preventDefault: jest.fn() };

    expect(gsm.handleWindowCloseEvent(event, null)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(global.stopTracking).not.toHaveBeenCalled();
  });

  describe('Windows close prompt', () => {
    const closePrompt = require('../close-prompt');
    let askSpy;
    let shouldAskSpy;

    beforeEach(() => {
      global.isQuitting = false;
      global.isTracking = true;
      global.stopTracking = jest.fn();
      shouldAskSpy = jest.spyOn(closePrompt, 'shouldAsk').mockReturnValue(true);
    });

    afterEach(() => {
      askSpy?.mockRestore();
      shouldAskSpy.mockRestore();
      delete global.isSystemShuttingDown;
    });

    const flush = () => new Promise((r) => setImmediate(r));

    it('keeps the window open until the user answers', () => {
      askSpy = jest.spyOn(closePrompt, 'askCloseChoice').mockReturnValue(new Promise(() => {}));
      const hide = jest.fn();
      const event = { preventDefault: jest.fn() };
      const win = { isDestroyed: () => false, hide };

      expect(gsm.handleWindowCloseEvent(event, win, { platform: 'win32' })).toBe(true);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(hide).not.toHaveBeenCalled();
      expect(askSpy).toHaveBeenCalledWith(win, { tracking: true });
    });

    it('"Keep running in background" hides and keeps tracking', async () => {
      askSpy = jest.spyOn(closePrompt, 'askCloseChoice').mockResolvedValue(closePrompt.CHOICE.BACKGROUND);
      const hide = jest.fn();
      const notify = jest.fn();
      const win = { isDestroyed: () => false, hide };

      gsm.handleWindowCloseEvent({ preventDefault: jest.fn() }, win, {
        platform: 'win32',
        showTrayNotification: notify,
      });
      await flush();

      expect(hide).toHaveBeenCalled();
      expect(global.stopTracking).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith('Tavilo Time', expect.stringMatching(/Still tracking.*Quit/));
    });

    it('"Quit" fully quits the app', async () => {
      askSpy = jest.spyOn(closePrompt, 'askCloseChoice').mockResolvedValue(closePrompt.CHOICE.QUIT);
      const quitSpy = jest.spyOn(gsm, 'quitApp').mockImplementation(() => {});
      const hide = jest.fn();

      gsm.handleWindowCloseEvent({ preventDefault: jest.fn() }, { isDestroyed: () => false, hide }, {
        platform: 'win32',
      });
      await flush();

      expect(quitSpy).toHaveBeenCalled();
      expect(hide).not.toHaveBeenCalled();
      quitSpy.mockRestore();
    });

    it('"Cancel" leaves the window as it was', async () => {
      askSpy = jest.spyOn(closePrompt, 'askCloseChoice').mockResolvedValue(closePrompt.CHOICE.CANCEL);
      const quitSpy = jest.spyOn(gsm, 'quitApp').mockImplementation(() => {});
      const hide = jest.fn();

      gsm.handleWindowCloseEvent({ preventDefault: jest.fn() }, { isDestroyed: () => false, hide }, {
        platform: 'win32',
      });
      await flush();

      expect(hide).not.toHaveBeenCalled();
      expect(quitSpy).not.toHaveBeenCalled();
      quitSpy.mockRestore();
    });
  });

  describe('close-prompt rules', () => {
    const closePrompt = require('../close-prompt');

    afterEach(() => {
      delete global.isSystemShuttingDown;
      closePrompt._resetForTests();
    });

    it('never asks on macOS or during OS shutdown', () => {
      expect(closePrompt.shouldAsk('darwin')).toBe(false);
      global.isSystemShuttingDown = true;
      expect(closePrompt.shouldAsk('win32')).toBe(false);
    });

    it('asks on Windows by default', () => {
      expect(closePrompt.shouldAsk('win32')).toBe(true);
    });

    it('maps dialog buttons to choices and defaults to keep running', async () => {
      const opts = closePrompt.buildDialogOptions(true);
      expect(opts.defaultId).toBe(0);
      expect(opts.cancelId).toBe(2);
      expect(opts.buttons[1]).toMatch(/quit/i);

      const make = (response) => ({ showMessageBox: jest.fn().mockResolvedValue({ response, checkboxChecked: false }) });
      expect(await closePrompt.askCloseChoice(null, { tracking: true, dialog: make(0) })).toBe('background');
      expect(await closePrompt.askCloseChoice(null, { tracking: true, dialog: make(1) })).toBe('quit');
      expect(await closePrompt.askCloseChoice(null, { tracking: true, dialog: make(2) })).toBe('cancel');
    });

    it('does not stack a second prompt while one is open', async () => {
      let resolve;
      const dialog = { showMessageBox: jest.fn(() => new Promise((r) => { resolve = r; })) };
      const first = closePrompt.askCloseChoice(null, { tracking: false, dialog });
      expect(await closePrompt.askCloseChoice(null, { tracking: false, dialog })).toBe('cancel');
      resolve({ response: 0, checkboxChecked: false });
      expect(await first).toBe('background');
      expect(dialog.showMessageBox).toHaveBeenCalledTimes(1);
    });
  });
});
