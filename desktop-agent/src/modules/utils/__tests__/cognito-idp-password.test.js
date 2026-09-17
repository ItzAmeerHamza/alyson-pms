const {
  requestForgotPassword,
  confirmForgotPasswordRequest,
  PASSWORD_POLICY_MESSAGE,
} = require('../cognito-idp-password');

const AUTH_CONFIG = {
  cognito_region: 'us-west-2',
  cognito_user_pool_id: 'us-west-2_abc123',
  cognito_client_id: 'client-abc123',
};

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

describe('cognito IDP forgot password', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('posts ForgotPassword to cognito-idp and returns delivery details', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        CodeDeliveryDetails: { Destination: 'a***@c***', DeliveryMedium: 'EMAIL' },
      }),
    );

    const sent = await requestForgotPassword('Ada@Cintara.ai', AUTH_CONFIG);

    expect(sent).toEqual({
      email: 'ada@cintara.ai',
      delivery: { Destination: 'a***@c***', DeliveryMedium: 'EMAIL' },
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://cognito-idp.us-west-2.amazonaws.com/');
    expect(opts.headers['X-Amz-Target']).toBe('AWSCognitoIdentityProviderService.ForgotPassword');
    expect(JSON.parse(opts.body)).toEqual({
      ClientId: 'client-abc123',
      Username: 'ada@cintara.ai',
    });
  });

  it('hides whether the email exists', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(400, {
        __type: 'UserNotFoundException',
        message: 'User does not exist.',
      }),
    );

    await expect(requestForgotPassword('missing@cintara.ai', AUTH_CONFIG)).resolves.toEqual({
      email: 'missing@cintara.ai',
      delivery: null,
    });
  });

  it('explains when a temp-password account cannot use forgot password', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(400, {
        __type: 'com.amazonaws.cognito.identity.idp.model#InvalidParameterException',
        message: 'User password cannot be reset in the current state.',
      }),
    );

    await expect(requestForgotPassword('ada@cintara.ai', AUTH_CONFIG)).rejects.toThrow(
      /temporary invite password/i,
    );
  });

  it('confirms the email code through ConfirmForgotPassword', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, {}));

    await expect(
      confirmForgotPasswordRequest('ada@cintara.ai', '123456', 'Abcd1234!', AUTH_CONFIG),
    ).resolves.toEqual({ email: 'ada@cintara.ai' });

    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers['X-Amz-Target']).toBe(
      'AWSCognitoIdentityProviderService.ConfirmForgotPassword',
    );
    expect(JSON.parse(opts.body)).toEqual({
      ClientId: 'client-abc123',
      Username: 'ada@cintara.ai',
      ConfirmationCode: '123456',
      Password: 'Abcd1234!',
    });
  });

  it('rejects a weak replacement password before calling Cognito', async () => {
    global.fetch = jest.fn();
    await expect(
      confirmForgotPasswordRequest('ada@cintara.ai', '123456', 'weak', AUTH_CONFIG),
    ).rejects.toThrow(PASSWORD_POLICY_MESSAGE);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
