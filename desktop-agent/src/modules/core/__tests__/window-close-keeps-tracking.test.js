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
    });

    expect(intercepted).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(hide).toHaveBeenCalled();
    expect(global.stopTracking).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      'Alyson PM',
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
});
