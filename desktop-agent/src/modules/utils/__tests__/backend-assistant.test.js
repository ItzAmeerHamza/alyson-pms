jest.mock('../cognito-token', () => ({
  resolveAssistantToken: jest.fn(),
  readDiskSession: jest.fn(async () => ({ organization_id: '10' })),
}));

const { resolveAssistantToken } = require('../cognito-token');
const {
  DATE_RE,
  normalizeDate,
  genericError,
  fetchAssistantBriefing,
  fetchAssistantChat,
} = require('../backend-assistant');

describe('backend assistant client', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('accepts work-calendar dates only', () => {
    expect(normalizeDate('2026-09-17')).toBe('2026-09-17');
    expect(DATE_RE.test('09/17/2026')).toBe(false);
    expect(() => normalizeDate('today')).toThrow('Invalid date');
  });

  it('keeps API errors generic', () => {
    expect(genericError(401)).toBe('Please sign in again.');
    expect(genericError(403)).toBe('Could not load Alyson Coach right now.');
    expect(genericError(429)).toMatch(/busy/i);
    expect(genericError(500)).not.toMatch(/stack|internal/i);
  });

  it('rejects an empty chat message before calling the API', async () => {
    const result = await fetchAssistantChat({}, { date: '2026-09-17', message: '   ' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Ask a question first.');
    expect(resolveAssistantToken).not.toHaveBeenCalled();
  });

  it('retries once after 401 by refreshing the stored Cognito session', async () => {
    resolveAssistantToken
      .mockResolvedValueOnce('stale-token')
      .mockResolvedValueOnce('fresh-token');
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ status: 401, ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ opening: 'Here is your month so far.' }),
      });

    const result = await fetchAssistantBriefing(
      { api_base_url: 'https://api.example' },
      { date: '2026-09-17', idToken: 'stale-token' },
    );
    expect(result).toEqual({
      success: true,
      data: { opening: 'Here is your month so far.' },
    });
    expect(resolveAssistantToken).toHaveBeenNthCalledWith(
      2,
      { api_base_url: 'https://api.example' },
      null,
      { forceRefresh: true },
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh-token');
    expect(global.fetch.mock.calls[1][1].headers['X-Pulse-Workspace-Id']).toBe('10');
  });
});
