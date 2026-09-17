const mockAuthenticateUser = jest.fn();
const mockCompleteNewPasswordChallenge = jest.fn();
const mockChangePassword = jest.fn();
const mockSetSignInUserSession = jest.fn();

jest.mock('amazon-cognito-identity-js', () => {
  function CognitoUser() {
    this.authenticateUser = mockAuthenticateUser;
    this.completeNewPasswordChallenge = mockCompleteNewPasswordChallenge;
    this.changePassword = mockChangePassword;
    this.setSignInUserSession = mockSetSignInUserSession;
    this.getUsername = () => 'ada@cintara.ai';
  }
  return {
    AuthenticationDetails: jest.fn(),
    CognitoUser,
    CognitoUserPool: jest.fn(),
    CognitoRefreshToken: jest.fn(),
    CognitoIdToken: jest.fn(),
    CognitoAccessToken: jest.fn(),
    CognitoUserSession: jest.fn(),
  };
});

const cognitoAuth = require('../cognito-auth');

const AUTH_CONFIG = {
  cognito_user_pool_id: 'us-west-2_abc123',
  cognito_client_id: 'client-abc123',
};

function fakeSession() {
  return {
    getIdToken: () => ({
      getJwtToken: () => 'id-token',
      payload: { email: 'ada@cintara.ai' },
      getExpiration: () => Math.floor(Date.now() / 1000) + 3600,
    }),
    getAccessToken: () => ({ getJwtToken: () => 'access-token' }),
    getRefreshToken: () => ({ getToken: () => 'refresh-token' }),
  };
}

describe('desktop Cognito password helpers', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.localStorage = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };
    mockAuthenticateUser.mockReset();
    mockCompleteNewPasswordChallenge.mockReset();
    mockChangePassword.mockReset();
    mockSetSignInUserSession.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('accepts the same password rule as the web portal', () => {
    expect(cognitoAuth.isStrongPassword('Abcd1234!')).toBe(true);
    expect(cognitoAuth.isStrongPassword('short1!')).toBe(false);
    expect(cognitoAuth.isStrongPassword('NoSymbol1234')).toBe(false);
    expect(cognitoAuth.isStrongPassword('nouppercase1!')).toBe(false);
  });

  it('returns a NEW_PASSWORD_REQUIRED challenge instead of telling users to use the web portal', async () => {
    mockAuthenticateUser.mockImplementation((_details, callbacks) => {
      callbacks.newPasswordRequired({ email: 'ada@cintara.ai', email_verified: true });
    });

    const result = await cognitoAuth.signInWithEmailPassword(
      'ada@cintara.ai',
      'Tmp#Pass12',
      AUTH_CONFIG,
    );

    expect(cognitoAuth.isNewPasswordChallenge(result)).toBe(true);
    expect(result.email).toBe('ada@cintara.ai');
    expect(result.cognitoUser).toBeTruthy();
  });

  it('completes the invite challenge and stores the session', async () => {
    mockCompleteNewPasswordChallenge.mockImplementation((_password, attrs, callbacks) => {
      expect(attrs.email).toBeUndefined();
      expect(attrs.email_verified).toBeUndefined();
      callbacks.onSuccess(fakeSession());
    });

    const stored = await cognitoAuth.completeNewPasswordChallenge(
      {
        completeNewPasswordChallenge: mockCompleteNewPasswordChallenge,
        getUsername: () => 'ada@cintara.ai',
      },
      'Abcd1234!',
      { email: 'ada@cintara.ai', email_verified: true, given_name: 'Ada' },
    );

    expect(stored.idToken).toBe('id-token');
    expect(stored.refreshToken).toBe('refresh-token');
    expect(global.localStorage.setItem).toHaveBeenCalled();
  });

  it('rejects a weak replacement password before calling Cognito', async () => {
    await expect(
      cognitoAuth.completeNewPasswordChallenge({ completeNewPasswordChallenge: jest.fn() }, 'weak'),
    ).rejects.toThrow(cognitoAuth.PASSWORD_POLICY_MESSAGE);
    expect(mockCompleteNewPasswordChallenge).not.toHaveBeenCalled();
  });

  it('sends a reset code and hides whether the email exists', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ __type: 'UserNotFoundException', message: 'User does not exist.' }),
    });

    await expect(
      cognitoAuth.forgotPassword('missing@cintara.ai', AUTH_CONFIG),
    ).resolves.toEqual({ email: 'missing@cintara.ai', delivery: null });
  });

  it('explains when a temp-password account cannot use forgot password', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        __type: 'InvalidParameterException',
        message: 'User password cannot be reset in the current state.',
      }),
    });

    await expect(cognitoAuth.forgotPassword('ada@cintara.ai', AUTH_CONFIG)).rejects.toThrow(
      /temporary invite password/i,
    );
  });

  it('confirms the email code and sets a new password', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await expect(
      cognitoAuth.confirmForgotPassword('ada@cintara.ai', '123456', 'Abcd1234!', AUTH_CONFIG),
    ).resolves.toEqual({ email: 'ada@cintara.ai' });
  });

  it('uses main-process IPC for forgot password when ipcRenderer is available', async () => {
    global.fetch = jest.fn();
    const ipcRenderer = {
      invoke: jest.fn().mockResolvedValue({
        ok: true,
        email: 'ada@cintara.ai',
        delivery: { Destination: 'a***@c***' },
      }),
    };

    await expect(
      cognitoAuth.forgotPassword('ada@cintara.ai', AUTH_CONFIG, ipcRenderer),
    ).resolves.toEqual({
      email: 'ada@cintara.ai',
      delivery: { Destination: 'a***@c***' },
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('auth:forgot-password', {
      email: 'ada@cintara.ai',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
