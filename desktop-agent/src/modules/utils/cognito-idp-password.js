/**
 * Cognito ForgotPassword / ConfirmForgotPassword via the IDP HTTP API.
 * Must run in the Electron main process (or Node). Renderer file:// pages
 * cannot call cognito-idp because of CORS.
 */

const PASSWORD_POLICY_RE =
  /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9])(?!.*\s).{8,256}$/;

const PASSWORD_POLICY_MESSAGE =
  'Use 8 or more characters with a mix of uppercase, lowercase, numbers, and a symbol.';

function isStrongPassword(value) {
  return PASSWORD_POLICY_RE.test(String(value || ''));
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function cognitoRegion(authConfig) {
  const explicit = String(authConfig?.cognito_region || '').trim();
  if (explicit) return explicit;
  const pool = String(authConfig?.cognito_user_pool_id || '');
  const fromPool = pool.split('_')[0];
  return fromPool || 'us-west-2';
}

function cognitoErrorCode(data) {
  return String(data?.__type || data?.code || data?.name || '')
    .split('#')
    .pop();
}

function mapForgotPasswordError(err) {
  const code = err?.code || err?.name || '';
  const msg = String(err?.message || err || '');
  if (code === 'UserNotFoundException') {
    return 'If an account exists for this email, we sent a reset code. Check your inbox.';
  }
  if (code === 'CodeMismatchException' || /invalid.*verification code|Invalid code/i.test(msg)) {
    return 'That reset code is incorrect. Check the email and try again.';
  }
  if (code === 'ExpiredCodeException' || /expired/i.test(msg)) {
    return 'That reset code has expired. Request a new one.';
  }
  if (
    code === 'InvalidParameterException' ||
    /cannot be reset|current state|FORCE_CHANGE|temporary password/i.test(msg)
  ) {
    return 'This account still uses a temporary invite password. Sign in with the password from your invite email, or ask your admin to resend the invite.';
  }
  if (code === 'LimitExceededException' || /attempt limit|too many/i.test(msg)) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (code === 'InvalidPasswordException' || /password.*policy|Password did not conform/i.test(msg)) {
    return PASSWORD_POLICY_MESSAGE;
  }
  if (code === 'CodeDeliveryFailureException') {
    return 'We could not send the reset email. Try again in a minute.';
  }
  if (/abort|timeout|timed out|Failed to fetch|network/i.test(msg)) {
    return 'Password reset timed out. Check your network and try again.';
  }
  return msg || 'Could not reset password. Please try again.';
}

async function cognitoIdpRequest(authConfig, target, extraBody) {
  const region = cognitoRegion(authConfig);
  const clientId = String(authConfig?.cognito_client_id || '').trim();
  if (!clientId) {
    throw new Error('Cognito is not configured on the desktop agent');
  }
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), 20000);
  try {
    const res = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
      },
      body: JSON.stringify({ ClientId: clientId, ...extraBody }),
      signal: controller?.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || data.Message || 'Cognito request failed');
      err.code = cognitoErrorCode(data);
      throw err;
    }
    return data;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Password reset timed out. Check your network and try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function requestForgotPassword(email, authConfig) {
  if (!isValidEmail(email)) {
    throw new Error('Enter a valid email address.');
  }
  const username = normalizeEmail(email);
  try {
    const data = await cognitoIdpRequest(authConfig, 'ForgotPassword', {
      Username: username,
    });
    return {
      email: username,
      delivery: data?.CodeDeliveryDetails || null,
    };
  } catch (err) {
    if (err?.code === 'UserNotFoundException') {
      return { email: username, delivery: null };
    }
    throw new Error(mapForgotPasswordError(err));
  }
}

async function confirmForgotPasswordRequest(email, code, newPassword, authConfig) {
  if (!isValidEmail(email)) {
    throw new Error('Enter a valid email address.');
  }
  const verificationCode = String(code || '').trim();
  if (!verificationCode || verificationCode.length > 32) {
    throw new Error('Enter the code from your email.');
  }
  if (!isStrongPassword(newPassword)) {
    throw new Error(PASSWORD_POLICY_MESSAGE);
  }
  try {
    await cognitoIdpRequest(authConfig, 'ConfirmForgotPassword', {
      Username: normalizeEmail(email),
      ConfirmationCode: verificationCode,
      Password: String(newPassword),
    });
    return { email: normalizeEmail(email) };
  } catch (err) {
    throw new Error(mapForgotPasswordError(err));
  }
}

module.exports = {
  PASSWORD_POLICY_MESSAGE,
  isStrongPassword,
  isValidEmail,
  normalizeEmail,
  mapForgotPasswordError,
  requestForgotPassword,
  confirmForgotPasswordRequest,
};
