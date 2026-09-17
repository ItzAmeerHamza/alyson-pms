const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const {
  jwtExpMs,
  isJwtFresh,
  persistDiskTokens,
  resolveAssistantToken,
} = require('../cognito-token');

function makeJwt(expSeconds) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString('base64url');
  return `${header}.${payload}.sig`;
}

describe('cognito token refresh for Coach', () => {
  let sessionPath;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    sessionPath = path.join(
      os.tmpdir(),
      `alyson-coach-session-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
    );
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    await fs.rm(sessionPath, { force: true });
  });

  it('treats a JWT as fresh when exp is more than a minute away', () => {
    const token = makeJwt(Math.floor(Date.now() / 1000) + 3600);
    expect(isJwtFresh(token)).toBe(true);
    expect(jwtExpMs(token)).toBeGreaterThan(Date.now());
  });

  it('refreshes an expired disk token with the stored refresh token', async () => {
    const expired = makeJwt(Math.floor(Date.now() / 1000) - 120);
    const fresh = makeJwt(Math.floor(Date.now() / 1000) + 3600);
    await fs.writeFile(
      sessionPath,
      JSON.stringify({
        access_token: expired,
        refresh_token: 'refresh-keep',
        email: 'ada@example.com',
      }),
      'utf8',
    );
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        AuthenticationResult: { IdToken: fresh, ExpiresIn: 3600 },
      }),
    });

    const token = await resolveAssistantToken(
      { cognito_client_id: 'client', cognito_region: 'us-west-2' },
      null,
      { sessionPath },
    );
    expect(token).toBe(fresh);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(await fs.readFile(sessionPath, 'utf8'));
    expect(saved.access_token).toBe(fresh);
    expect(saved.refresh_token).toBe('refresh-keep');
  });

  it('writes merged tokens without dropping other session fields', async () => {
    await fs.writeFile(
      sessionPath,
      JSON.stringify({ id: '42', email: 'ada@example.com', role: 'employee' }),
      'utf8',
    );
    await persistDiskTokens(
      { idToken: 'id', refreshToken: 'rf', expiresAt: 9 },
      sessionPath,
    );
    const saved = JSON.parse(await fs.readFile(sessionPath, 'utf8'));
    expect(saved.id).toBe('42');
    expect(saved.email).toBe('ada@example.com');
    expect(saved.access_token).toBe('id');
  });
});
