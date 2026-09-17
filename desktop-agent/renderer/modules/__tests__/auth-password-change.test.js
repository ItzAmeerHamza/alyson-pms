jest.mock('../cognito-auth', () => ({
  signInWithEmailPassword: jest.fn(),
  signOutCognito: jest.fn(),
  getCurrentCognitoSession: jest.fn().mockResolvedValue(null),
  refreshCognitoSession: jest.fn().mockResolvedValue(null),
  hydrateCognitoSessionFromDisk: jest.fn(),
  clearCognitoSession: jest.fn(),
  completeNewPasswordChallenge: jest.fn(),
  changePassword: jest.fn(),
  forgotPassword: jest.fn(),
  confirmForgotPassword: jest.fn(),
  isNewPasswordChallenge: (result) =>
    Boolean(result && result.challengeName === 'NEW_PASSWORD_REQUIRED' && result.cognitoUser),
  isStrongPassword: (value) =>
    /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9])(?!.*\s).{8,256}$/.test(String(value || '')),
  isValidEmail: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim().toLowerCase()),
  PASSWORD_POLICY_MESSAGE:
    'Use 8 or more characters with a mix of uppercase, lowercase, numbers, and a symbol.',
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

function makeDom() {
  const nodes = {};
  const makeEl = (id) => {
    const el = {
      id,
      value: '',
      hidden: id === 'newPasswordForm' || id === 'changePasswordModal',
      style: { display: id === 'newPasswordForm' ? 'none' : '' },
      textContent: '',
      classList: {
        _classes: new Set(),
        add(name) {
          this._classes.add(name);
        },
        remove(name) {
          this._classes.delete(name);
        },
        contains(name) {
          return this._classes.has(name);
        },
      },
      focus: jest.fn(),
      reset: jest.fn(),
      disabled: false,
    };
    nodes[id] = el;
    return el;
  };
  [
    'loginForm',
    'newPasswordForm',
    'newPasswordHint',
    'newPasswordError',
    'newPassword',
    'confirmNewPassword',
    'newPasswordBtn',
    'newPasswordBtnText',
    'newPasswordLoader',
    'changePasswordModal',
    'changePasswordForm',
    'changePasswordError',
    'currentPassword',
    'changeNewPassword',
    'changeConfirmPassword',
    'changePasswordSaveBtn',
    'forgotPasswordModal',
    'forgotRequestForm',
    'forgotConfirmForm',
    'forgotEmail',
    'forgotRequestError',
    'forgotConfirmError',
    'forgotConfirmHint',
    'forgotResetCode',
    'forgotNewPassword',
    'forgotConfirmPassword',
    'forgotSendCodeBtn',
    'forgotResetSaveBtn',
    'loginEmail',
    'loginPassword',
  ].forEach(makeEl);
  global.document = {
    getElementById: (id) => nodes[id] || null,
    body: {
      classList: {
        _classes: new Set(),
        toggle(name, on) {
          if (on) this._classes.add(name);
          else this._classes.delete(name);
        },
        contains(name) {
          return this._classes.has(name);
        },
      },
    },
  };
  return nodes;
}

function makeManager() {
  const ipcRenderer = { invoke: jest.fn().mockResolvedValue(CONFIG) };
  const manager = new AuthManager(
    ipcRenderer,
    { showMainApp: jest.fn(), showLogin: jest.fn() },
    { showNotification: jest.fn() },
  );
  manager.authConfig = CONFIG;
  manager.credentialManager = { saveCredentials: jest.fn().mockResolvedValue(true) };
  return { manager, ipcRenderer };
}

describe('desktop password change from login and sidebar', () => {
  beforeEach(() => {
    global.window = { dispatchEvent: jest.fn() };
    global.localStorage = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };
    jest.clearAllMocks();
    makeDom();
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
    delete global.localStorage;
  });

  it('stops at the set-password form when Cognito requires a new password', async () => {
    const { manager } = makeManager();
    const cognitoUser = { completeNewPasswordChallenge: jest.fn() };
    cognitoAuth.signInWithEmailPassword.mockResolvedValue({
      challengeName: 'NEW_PASSWORD_REQUIRED',
      cognitoUser,
      email: 'ada@cintara.ai',
      userAttributes: { email: 'ada@cintara.ai' },
    });

    const result = await manager.handleCognitoLogin('ada@cintara.ai', 'Tmp#Pass12', '', true);

    expect(result.challengeName).toBe('NEW_PASSWORD_REQUIRED');
    expect(authApi.fetchAuthMe).not.toHaveBeenCalled();
    expect(document.getElementById('loginForm').style.display).toBe('none');
    expect(document.getElementById('newPasswordForm').hidden).toBe(false);
    expect(document.getElementById('newPasswordHint').textContent).toMatch(/ada@cintara.ai/);
  });

  it('finishes sign-in after the user sets a permanent password', async () => {
    const { manager, ipcRenderer } = makeManager();
    ipcRenderer.invoke.mockImplementation(async (channel) => {
      if (channel === 'get-config') return CONFIG;
      if (channel === 'set-current-user-id') return { success: true };
      if (channel === 'user-logged-in') return { success: true };
      if (channel === 'check-for-update') return { updateAvailable: false };
      return null;
    });
    manager._pendingNewPassword = {
      cognitoUser: { completeNewPasswordChallenge: jest.fn() },
      email: 'ada@cintara.ai',
      company: '',
      rememberMe: true,
      userAttributes: {},
    };
    document.getElementById('newPassword').value = 'Abcd1234!';
    document.getElementById('confirmNewPassword').value = 'Abcd1234!';
    cognitoAuth.completeNewPasswordChallenge.mockResolvedValue({
      idToken: 'id-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 3600_000,
      refreshExpiresAt: Date.now() + 86400_000,
    });
    authApi.fetchAuthMe.mockResolvedValue({
      user: {
        id: '12345',
        email: 'ada@cintara.ai',
        full_name: 'Ada Lovelace',
        role: 'employee',
        organization_id: 'org-1',
      },
      organization: { slug: 'revcloud' },
    });

    await manager.handleCompleteNewPassword({ preventDefault() {} });

    expect(cognitoAuth.completeNewPasswordChallenge).toHaveBeenCalled();
    expect(authApi.fetchAuthMe).toHaveBeenCalledWith('id-token', CONFIG, ipcRenderer);
    expect(manager.currentUser.email).toBe('ada@cintara.ai');
    expect(manager.credentialManager.saveCredentials).toHaveBeenCalledWith(
      'ada@cintara.ai',
      'Abcd1234!',
    );
  });

  it('updates keytar after a signed-in password change', async () => {
    const { manager } = makeManager();
    manager.currentUser = { email: 'ada@cintara.ai' };
    document.getElementById('currentPassword').value = 'OldPass12!';
    document.getElementById('changeNewPassword').value = 'Abcd1234!';
    document.getElementById('changeConfirmPassword').value = 'Abcd1234!';
    cognitoAuth.changePassword.mockResolvedValue('SUCCESS');

    await manager.handleChangePassword({ preventDefault() {} });

    expect(cognitoAuth.changePassword).toHaveBeenCalledWith(
      'OldPass12!',
      'Abcd1234!',
      CONFIG,
    );
    expect(manager.credentialManager.saveCredentials).toHaveBeenCalledWith(
      'ada@cintara.ai',
      'Abcd1234!',
    );
    expect(document.getElementById('changePasswordModal').hidden).toBe(true);
  });

  it('sends a reset code through Cognito IPC', async () => {
    const { manager, ipcRenderer } = makeManager();
    cognitoAuth.forgotPassword.mockResolvedValue({
      email: 'ada@cintara.ai',
      delivery: { Destination: 'a***@c***' },
    });
    document.getElementById('forgotEmail').value = 'ada@cintara.ai';

    await manager.handleSendResetCode({ preventDefault() {} });

    expect(cognitoAuth.forgotPassword).toHaveBeenCalledWith(
      'ada@cintara.ai',
      CONFIG,
      ipcRenderer,
    );
    expect(document.getElementById('forgotConfirmHint').textContent).toMatch(/a\*\*\*@c\*\*\*/);
  });

  it('hides the rest of the app while a password modal is open', () => {
    const { manager } = makeManager();
    manager.openForgotPasswordModal({ email: 'ada@cintara.ai' });
    expect(document.body.classList.contains('password-modal-open')).toBe(true);
    manager.closeForgotPasswordModal();
    expect(document.body.classList.contains('password-modal-open')).toBe(false);
  });

  it('resets password with an email code while signed in', async () => {
    const { manager, ipcRenderer } = makeManager();
    manager.currentUser = { email: 'ada@cintara.ai' };
    cognitoAuth.forgotPassword.mockResolvedValue({ email: 'ada@cintara.ai' });
    cognitoAuth.confirmForgotPassword.mockResolvedValue({ email: 'ada@cintara.ai' });

    manager.openForgotPasswordModal({ email: 'ada@cintara.ai', stayLoggedIn: true });
    await Promise.resolve();
    document.getElementById('forgotResetCode').value = '123456';
    document.getElementById('forgotNewPassword').value = 'Abcd1234!';
    document.getElementById('forgotConfirmPassword').value = 'Abcd1234!';

    await manager.handleConfirmResetPassword({ preventDefault() {} });

    expect(cognitoAuth.confirmForgotPassword).toHaveBeenCalledWith(
      'ada@cintara.ai',
      '123456',
      'Abcd1234!',
      CONFIG,
      ipcRenderer,
    );
    expect(manager.credentialManager.saveCredentials).toHaveBeenCalledWith(
      'ada@cintara.ai',
      'Abcd1234!',
    );
    expect(manager.currentUser).toEqual({ email: 'ada@cintara.ai' });
    expect(document.getElementById('forgotPasswordModal').hidden).toBe(true);
  });
});
