jest.mock('../cognito-token', () => ({
  resolveAssistantToken: jest.fn(),
  readDiskSession: jest.fn(async () => ({ organization_id: '10' })),
}));

const { resolveAssistantToken } = require('../cognito-token');
const {
  normalizeReport,
  redactDiagnostics,
  buildDiagnostics,
  genericError,
  submitIssueReport,
} = require('../issue-report');

describe('issue report client', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('requires a category and a short description', () => {
    expect(normalizeReport({ category: 'nope', message: 'hello world' }).ok).toBe(false);
    expect(normalizeReport({ category: 'tracking', message: 'too short' }).error).toMatch(/few words/i);
    expect(normalizeReport({
      category: 'tracking',
      message: 'The timer stopped while I was working.',
      includeDiagnostics: false,
    }).report).toEqual({
      category: 'tracking',
      message: 'The timer stopped while I was working.',
      include_diagnostics: false,
    });
  });

  it('strips tokens from diagnostics', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.signaturevalue';
    const text = buildDiagnostics({
      appVersion: '1.0.248',
      platform: 'darwin',
      osSummary: 'Darwin 24',
      tracking: true,
      healthOverall: 'ok',
      logLines: [`Authorization: Bearer secret-token ${jwt}`],
    });
    expect(text).not.toContain('secret-token');
    expect(text).not.toContain(jwt);
    expect(text).toContain('Tracking: on');
  });

  it('keeps API failures generic', () => {
    expect(genericError(401)).toBe('Please sign in again.');
    expect(genericError(429)).toMatch(/several reports/i);
    expect(genericError(500)).toBe('Could not send the report. Try again.');
    expect(redactDiagnostics('plain note')).toBe('plain note');
  });

  it('posts the report and omits logs when diagnostics are off', async () => {
    resolveAssistantToken.mockResolvedValue('token-1');
    global.fetch = jest.fn(async (_url, options) => {
      const body = JSON.parse(options.body);
      expect(body.include_diagnostics).toBe(false);
      expect(body.diagnostics).toBeUndefined();
      expect(body.app_version).toBe('1.0.248');
      expect(options.headers['X-Pulse-Workspace-Id']).toBe('10');
      return { ok: true, status: 200, json: async () => ({ id: 'rep-1' }) };
    });

    const result = await submitIssueReport(
      { api_base_url: 'https://pulse.example' },
      {
        category: 'permissions',
        message: 'Screen recording stays off after I allow it.',
        includeDiagnostics: false,
      },
      { collect: () => ({ appVersion: '1.0.248', platform: 'darwin', osSummary: 'Darwin', tracking: false, healthOverall: 'fail', logLines: ['token Bearer nope'] }) },
    );
    expect(result).toEqual({ success: true, id: 'rep-1' });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://pulse.example/pulse/issue-reports',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('refreshes a rejected sign-in once', async () => {
    resolveAssistantToken
      .mockResolvedValueOnce('stale')
      .mockResolvedValueOnce('fresh');
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'rep-2' }) });

    const result = await submitIssueReport(
      { api_base_url: 'https://pulse.example' },
      { category: 'other', message: 'The window opens behind other apps.' },
      { collect: () => ({ appVersion: '1', platform: 'win32', osSummary: 'Windows', logLines: [] }) },
    );
    expect(result.success).toBe(true);
    expect(resolveAssistantToken).toHaveBeenLastCalledWith(
      { api_base_url: 'https://pulse.example' },
      null,
      { forceRefresh: true },
    );
  });

  it.each(['tracking', 'screenshots', 'login', 'permissions', 'updates', 'other'])(
    'accepts the %s category',
    (category) => {
      const result = normalizeReport({
        category,
        message: 'This happened while I was tracking time.',
      });
      expect(result.ok).toBe(true);
      expect(result.report.category).toBe(category);
      expect(result.report.include_diagnostics).toBe(true);
    },
  );

  it('rejects blank, short, and oversized descriptions', () => {
    expect(normalizeReport({ category: '', message: 'long enough description' }).error).toMatch(/what the issue/i);
    expect(normalizeReport({ category: 'login', message: '123456789' }).ok).toBe(false);
    expect(normalizeReport({ category: 'login', message: '1234567890' }).ok).toBe(true);
    expect(normalizeReport({ category: 'login', message: 'x'.repeat(4000) }).ok).toBe(true);
    expect(normalizeReport({ category: 'login', message: 'x'.repeat(4001) }).error).toMatch(/4,000/);
    expect(normalizeReport({ category: 'login', message: '  timer died\u0000 today ' }).report.message).toBe(
      'timer died today',
    );
  });

  it('includes redacted logs when diagnostics are on and caps the payload', async () => {
    resolveAssistantToken.mockResolvedValue('token-1');
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.signaturevalue';
    global.fetch = jest.fn(async (_url, options) => {
      const body = JSON.parse(options.body);
      expect(body.category).toBe('screenshots');
      expect(body.include_diagnostics).toBe(true);
      expect(body.diagnostics).toContain('Tracking: off');
      expect(body.diagnostics).not.toContain('secret-token');
      expect(body.diagnostics).not.toContain(jwt);
      expect(body.diagnostics.length).toBeLessThanOrEqual(12000);
      return { ok: true, status: 200, json: async () => ({ id: 'rep-logs' }) };
    });

    const result = await submitIssueReport(
      { api_base_url: 'https://pulse.example' },
      { category: 'screenshots', message: 'Screenshots stopped after the display slept.', includeDiagnostics: true },
      {
        collect: () => ({
          appVersion: '1.0.248',
          platform: 'darwin',
          osSummary: 'Darwin',
          tracking: false,
          healthOverall: 'fail',
          logLines: [`Bearer secret-token ${jwt}`, 'y'.repeat(20000)],
        }),
      },
    );
    expect(result).toEqual({ success: true, id: 'rep-logs' });
  });

  it('asks the user to sign in when there is no token', async () => {
    resolveAssistantToken.mockResolvedValue(null);
    global.fetch = jest.fn();
    const result = await submitIssueReport(
      { api_base_url: 'https://pulse.example' },
      { category: 'updates', message: 'The update downloaded but never installed.' },
    );
    expect(result).toEqual({ success: false, error: 'Please sign in again.' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('asks the user to sign in again when refresh also fails', async () => {
    resolveAssistantToken.mockResolvedValueOnce('stale').mockResolvedValueOnce('fresh');
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ message: 'jwt expired stack' }) })
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ message: 'still bad' }) });

    const result = await submitIssueReport(
      { api_base_url: 'https://pulse.example' },
      { category: 'other', message: 'The window opens behind other apps.' },
      { collect: () => ({ appVersion: '1', platform: 'win32', osSummary: 'Windows', logLines: [] }) },
    );
    expect(result).toEqual({ success: false, error: 'Please sign in again.' });
    expect(result.error).not.toMatch(/stack|jwt/i);
  });

  it('maps rate limits and server errors to generic messages', async () => {
    resolveAssistantToken.mockResolvedValue('token-1');
    global.fetch = jest.fn(async () => ({ ok: false, status: 429, json: async () => ({ message: 'db host secret' }) }));
    const limited = await submitIssueReport(
      { api_base_url: 'https://pulse.example' },
      { category: 'tracking', message: 'The clock jumped ahead by two hours.' },
      { collect: () => ({ appVersion: '1', platform: 'darwin', osSummary: 'Darwin', logLines: [] }) },
    );
    expect(limited.error).toMatch(/several reports/i);
    expect(limited.error).not.toContain('secret');

    global.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({ message: 'relation missing' }) }));
    const failed = await submitIssueReport(
      { api_base_url: 'https://pulse.example' },
      { category: 'tracking', message: 'The clock jumped ahead by two hours.' },
      { collect: () => ({ appVersion: '1', platform: 'darwin', osSummary: 'Darwin', logLines: [] }) },
    );
    expect(failed).toEqual({ success: false, error: 'Could not send the report. Try again.' });
  });

  it('survives a network failure without leaking the error', async () => {
    resolveAssistantToken.mockResolvedValue('token-1');
    global.fetch = jest.fn(async () => { throw new Error('connect ECONNREFUSED 10.0.0.8:5432'); });
    const result = await submitIssueReport(
      { api_base_url: 'https://pulse.example' },
      { category: 'permissions', message: 'Accessibility stays denied after I allow it.' },
      { collect: () => ({ appVersion: '1', platform: 'darwin', osSummary: 'Darwin', logLines: [] }) },
    );
    expect(result).toEqual({ success: false, error: 'Could not send the report. Try again.' });
    expect(result.error).not.toContain('5432');
  });

  it('omits the company header when the session has no workspace', async () => {
    const { readDiskSession } = require('../cognito-token');
    resolveAssistantToken.mockResolvedValue('token-1');
    readDiskSession.mockResolvedValueOnce(null);
    global.fetch = jest.fn(async (_url, options) => {
      expect(options.headers['X-Pulse-Workspace-Id']).toBeUndefined();
      return { ok: true, status: 200, json: async () => ({ id: 'rep-no-org' }) };
    });
    const result = await submitIssueReport(
      { api_base_url: 'https://pulse.example' },
      { category: 'login', message: 'Forgot password never emailed a code.', includeDiagnostics: false },
      { collect: () => ({ appVersion: '1', platform: 'linux', osSummary: 'Linux', logLines: [] }) },
    );
    expect(result.success).toBe(true);
  });
});
