const { escapeHtml, hoursLabel, shiftDateKey } = require('../assistant-coach');

describe('assistant coach helpers', () => {
  it('escapes HTML from model text', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
  });

  it('formats hours the same way Pulse emails do', () => {
    expect(hoursLabel(1 + 40 / 60)).toBe('1 hour 40 min');
    expect(hoursLabel(0)).toBe('0 min');
    expect(hoursLabel(7)).toBe('7 hours');
  });

  it('shifts calendar dates without crossing into the future caller', () => {
    expect(shiftDateKey('2026-09-17', -1)).toBe('2026-09-16');
    expect(shiftDateKey('2026-09-01', -1)).toBe('2026-08-31');
  });

  it('labels the selected work day as Today when it matches', () => {
    const { formatDateLabel } = require('../assistant-coach');
    expect(formatDateLabel('2026-09-17', '2026-09-17')).toBe('Thu, Sep 17 · Today');
    expect(formatDateLabel('2026-09-16', '2026-09-17')).toBe('Wed, Sep 16');
  });

  it('refreshes the stored Cognito session instead of asking for a new login', async () => {
    const { resolveCoachIdToken } = require('../assistant-coach');
    const ipcRenderer = {
      invoke: jest.fn(async (channel) => {
        if (channel === 'get-config') return { cognito_client_id: 'client' };
        if (channel === 'load-user-session') {
          return { refresh_token: 'refresh', email: 'ada@example.com', id: '42' };
        }
        if (channel === 'user-logged-in') return { success: true };
        return null;
      }),
    };
    const cognitoAuth = {
      hydrateCognitoSessionFromDisk: jest.fn(),
      getCurrentCognitoSession: jest.fn().mockResolvedValue({
        idToken: 'fresh-id',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 3600_000,
        email: 'ada@example.com',
      }),
    };
    const previous = global.localStorage;
    global.localStorage = {
      getItem: () => JSON.stringify({ id: '42', email: 'ada@example.com', organization_id: '10' }),
    };

    const token = await resolveCoachIdToken(ipcRenderer, cognitoAuth);
    expect(token).toEqual({ idToken: 'fresh-id', organizationId: '10' });
    expect(cognitoAuth.hydrateCognitoSessionFromDisk).toHaveBeenCalled();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      'user-logged-in',
      expect.objectContaining({
        session: expect.objectContaining({ access_token: 'fresh-id' }),
      }),
    );
    global.localStorage = previous;
  });
});
