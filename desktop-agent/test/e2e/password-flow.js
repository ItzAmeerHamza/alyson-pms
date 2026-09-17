/**
 * Password-flow E2E against the real Cognito pool (no UI).
 *
 * Safe: uses a non-existent email and never confirms a code for a real account.
 *
 *   node test/e2e/password-flow.js
 */

global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const {
  isStrongPassword,
  isValidEmail,
  PASSWORD_POLICY_MESSAGE,
  forgotPassword,
  confirmForgotPassword,
} = require('../../renderer/modules/cognito-auth');

const envConfig = require('../../env-config');

const AUTH_CONFIG = {
  cognito_user_pool_id: envConfig.VITE_COGNITO_USER_POOL_ID,
  cognito_client_id: envConfig.VITE_COGNITO_CLIENT_ID,
};

const results = { passed: [], failed: [] };
function pass(name) {
  results.passed.push(name);
  console.log(`PASS  ${name}`);
}
function fail(name, reason) {
  results.failed.push({ name, reason });
  console.log(`FAIL  ${name} -- ${reason}`);
}

async function run() {
  if (!AUTH_CONFIG.cognito_user_pool_id || !AUTH_CONFIG.cognito_client_id) {
    throw new Error('Cognito is not configured in env-config.js');
  }

  if (isStrongPassword('Abcd1234!') && !isStrongPassword('weak')) pass('password policy helper');
  else fail('password policy helper', 'expected Abcd1234! strong and weak rejected');

  if (isValidEmail('ada@cintara.ai') && !isValidEmail('not-an-email')) pass('email helper');
  else fail('email helper', 'email validation mismatch');

  try {
    await confirmForgotPassword('ada@cintara.ai', '123456', 'weak', AUTH_CONFIG);
    fail('weak confirm rejected client-side', 'expected throw');
  } catch (err) {
    if (String(err.message) === PASSWORD_POLICY_MESSAGE) pass('weak confirm rejected client-side');
    else fail('weak confirm rejected client-side', err.message);
  }

  const ghost = `e2e-password-reset-${Date.now()}@invalid.test`;
  try {
    const sent = await forgotPassword(ghost, AUTH_CONFIG);
    if (sent.email === ghost) pass('forgotPassword does not leak missing accounts');
    else fail('forgotPassword does not leak missing accounts', JSON.stringify(sent));
  } catch (err) {
    fail('forgotPassword does not leak missing accounts', err.message);
  }

  try {
    await confirmForgotPassword(ghost, '000000', 'Abcd1234!', AUTH_CONFIG);
    fail('bogus reset code rejected by Cognito', 'expected throw');
  } catch (err) {
    const msg = String(err.message || '');
    if (/incorrect|expired|could not reset|does not exist|UserNotFound|code/i.test(msg)) {
      pass(`bogus reset code rejected by Cognito (${msg})`);
    } else {
      fail('bogus reset code rejected by Cognito', msg);
    }
  }

  console.log('');
  console.log(`Passed ${results.passed.length}  Failed ${results.failed.length}`);
  if (results.failed.length) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
