/**
 * Sign-in must work as soon as the login form is reachable.
 *
 * The renderer boot path returns before AuthManager.initialize() whenever the
 * mandatory update gate is up, and initialize() is the only thing that loads the
 * Cognito settings. When the gate came down it revealed the login form without
 * re-running initialize(), so the form was live with authConfig still null and
 * createPool() rejected every correct password with "Cognito is not configured
 * on the desktop agent". Restarting cleared it, because the second launch found
 * no pending update and booted normally.
 *
 * Users who were already on the latest build never saw it — the gate only goes
 * up when an update is waiting, which is why this hit the people who were behind.
 */

jest.mock('../cognito-auth', () => ({
  signInWithEmailPassword: jest.fn(),
  signOutCognito: jest.fn(),
  getCurrentCognitoSession: jest.fn().mockResolvedValue(null),
  refreshCognitoSession: jest.fn().mockResolvedValue(null),
  hydrateCognitoSessionFromDisk: jest.fn(),
  clearCognitoSession: jest.fn(),
}));

jest.mock('../auth-api', () => ({
  fetchAuthMe: jest.fn(),
  isCognitoAuthEnabled: (cfg) => Boolean(cfg?.cognito_user_pool_id && cfg?.cognito_client_id),
}));

const cognitoAuth = require('../cognito-auth');
const authApi = require('../auth-api');
const AuthManager = require('../auth-manager');

const CONFIG = {
  cognito_user_pool_id: 'us-west-2_abc123',
  cognito_client_id: 'client-abc123',
};

function makeManager() {
  const ipcRenderer = { invoke: jest.fn().mockResolvedValue(CONFIG) };
  const manager = new AuthManager(ipcRenderer, null, { showNotification: jest.fn() });
  // Stop initialize() short of the parts that need real DOM/session plumbing.
  manager.loadRememberedCredentials = jest.fn().mockResolvedValue(undefined);
  manager.tryAutoLogin = jest.fn().mockResolvedValue(false);
  return { manager, ipcRenderer };
}

describe('auth initialization around the mandatory update gate', () => {
  beforeEach(() => {
    global.window = {};
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete global.window;
  });

  it('skips initialization while the gate is up, leaving no config', async () => {
    global.window.__updateGateActive = true;
    const { manager, ipcRenderer } = makeManager();

    await manager.initialize();

    expect(ipcRenderer.invoke).not.toHaveBeenCalled();
    expect(manager.authConfig).toBeNull();
  });

  it('signs in with real config even when initialization was skipped', async () => {
    // Gate was up at boot, so nothing loaded the config...
    global.window.__updateGateActive = true;
    const { manager } = makeManager();
    await manager.initialize();
    expect(manager.authConfig).toBeNull();

    // ...then the gate came down and the login form was shown.
    global.window.__updateGateActive = false;

    cognitoAuth.signInWithEmailPassword.mockResolvedValue({ idToken: 'id-token' });
    authApi.fetchAuthMe.mockRejectedValue(new Error('stop-here'));

    await expect(
      manager.handleCognitoLogin('someone@cintara.ai', 'correct-password', '', true),
    ).rejects.toThrow('stop-here');

    // The regression: this used to be null, and Cognito rejected the sign-in
    // before the password ever left the machine.
    const [, , configUsed] = cognitoAuth.signInWithEmailPassword.mock.calls[0];
    expect(configUsed).toEqual(CONFIG);
  });

  it('can be initialized after the gate comes down', async () => {
    global.window.__updateGateActive = true;
    const { manager, ipcRenderer } = makeManager();
    await manager.initialize();

    global.window.__updateGateActive = false;
    await manager.initialize();

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('get-config');
    expect(manager.authConfig).toEqual(CONFIG);
    expect(manager.tryAutoLogin).toHaveBeenCalledTimes(1);
  });

  it('does not initialize twice when called again', async () => {
    const { manager, ipcRenderer } = makeManager();

    await manager.initialize();
    await manager.initialize();

    expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
    expect(manager.tryAutoLogin).toHaveBeenCalledTimes(1);
  });

  it('shares one initialization between concurrent callers', async () => {
    const { manager, ipcRenderer } = makeManager();

    await Promise.all([manager.initialize(), manager.initialize(), manager.initialize()]);

    expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
  });

  it('does not refetch config that is already loaded', async () => {
    const { manager, ipcRenderer } = makeManager();
    await manager.initialize();
    ipcRenderer.invoke.mockClear();

    await manager.ensureAuthConfig();

    expect(ipcRenderer.invoke).not.toHaveBeenCalled();
  });
});

describe('auto-login does not wait on a dead network', () => {
  beforeEach(() => {
    global.window = {};
    global.localStorage = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };
    jest.clearAllMocks();
    authApi.fetchAuthMe.mockImplementation(() => new Promise(() => {}));
    cognitoAuth.getCurrentCognitoSession.mockImplementation(() => new Promise(() => {}));
  });

  afterEach(() => {
    delete global.window;
    delete global.localStorage;
  });

  it('opens the app from the disk session without waiting for Cognito or /auth/me', async () => {
    const ipcRenderer = {
      invoke: jest.fn(async (channel) => {
        if (channel === 'get-config') return CONFIG;
        if (channel === 'load-user-session') {
          return {
            success: true,
            session: {
              remember_me: true,
              id: '1196',
              email: 'mohita@cintara.ai',
              access_token: 'id-token',
              refresh_token: 'refresh-token',
              role: 'admin',
            },
          };
        }
        if (channel === 'set-current-user-id') return true;
        if (channel === 'check-for-update') return new Promise(() => {});
        if (channel === 'user-logged-in') return {};
        return null;
      }),
    };
    const uiManager = { showMainApp: jest.fn(), showMandatoryUpdateGate: jest.fn() };
    const manager = new AuthManager(ipcRenderer, uiManager, { showNotification: jest.fn() });
    manager.authConfig = CONFIG;

    const opened = await manager.tryAutoLogin();

    expect(opened).toBe(true);
    expect(uiManager.showMainApp).toHaveBeenCalled();
    expect(manager.currentUser.id).toBe('1196');
    expect(authApi.fetchAuthMe).not.toHaveBeenCalled();
  });
});
