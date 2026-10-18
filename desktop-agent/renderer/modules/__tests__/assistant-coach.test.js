const {
  escapeHtml,
  hoursLabel,
  shiftDateKey,
  resetCoachAuthCacheForTests,
} = require('../assistant-coach');
const AssistantCoach = require('../assistant-coach');

afterEach(() => {
  resetCoachAuthCacheForTests();
});

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

  it('keeps this week on the same today as the tray clock', () => {
    const { hoursToSeconds, periodSplit, liveDelta, formatClock, formatCompact } = require('../assistant-coach');
    const stats = {
      tracked_hours: 9.2,
      non_effective_hours: 0.7,
      coaching: {
        week_hours_worked: 23.9,
        week_effective_hours: 23.2,
        week_non_effective_hours: 0.7,
        month_hours_worked: 75.3,
        month_effective_hours: 74.6,
        month_non_effective_hours: 0.7,
      },
    };
    const live = { total: 9 * 3600 + 14 * 60 + 15, nonEffective: 1 * 3600 + 31 * 60 };
    const delta = liveDelta(stats, live);
    const week = periodSplit(stats.coaching, 'week', delta);
    expect(hoursToSeconds(9.2)).toBe(9 * 3600 + 12 * 60);
    expect(formatClock(live.total)).toBe('09:14:15');
    expect(formatCompact(live.total - live.nonEffective)).toBe('7h 43m');
    expect(week.total).toBe(hoursToSeconds(23.9) + (live.total - hoursToSeconds(9.2)));
    expect(week.effective + week.nonEffective).toBe(week.total);
  });

  it('says when effective time is ahead of the hours expected by now', () => {
    const { paceCopy } = require('../assistant-coach');
    const pace = paceCopy({
      effectiveSeconds: (26 + 53 / 60) * 3600,
      expectedHours: 21,
      targetHours: 35,
      finishedWeekdays: 3,
      dailyHours: 7,
      periodLabel: 'week',
    });
    expect(pace.status).toBe('Ahead by 5h 53m');
    expect(pace.tone).toBe('ahead');
    expect(pace.detail).toContain('Expected by now: 21h 0m');
    expect(pace.detail).toContain('3 finished weekdays');
    expect(pace.detail).toContain('35h 0m week target');
    expect(pace.detail).not.toMatch(/\d+h \d+m of \d+h/);
    expect(pace.percent).toBeLessThanOrEqual(100);
  });

  it('answers a loaded day without waiting on the model', () => {
    const { instantCoachReply } = require('../assistant-coach');
    const stats = {
      tracked_hours: 9.2,
      effective_hours: 7.7,
      non_effective_hours: 1.5,
      screenshots: { total: 4, analyzed: 4, productive: 3, neutral: 1, distraction: 0, meeting: 0 },
      coaching: {
        week_hours_worked: 23.9,
        week_effective_hours: 22,
        week_non_effective_hours: 1.9,
        tips: ['Stop the timer when you step away.'],
      },
    };
    expect(instantCoachReply(stats, 'Break down my total time, effective time, and non-effective time.')).toMatch(
      /Total time is 9 hours 12 min/,
    );
    expect(instantCoachReply(stats, 'How do my hours look this week?')).toMatch(/This week: 23 hours 54 min/);
    expect(instantCoachReply(stats, 'how did my afternoon compare with my morning?')).toBeNull();
    expect(instantCoachReply(stats, 'How can I be more productive tomorrow?')).toBeNull();
    expect(instantCoachReply(stats, 'Give me specific suggestions to improve effective time today.')).toBeNull();
    expect(instantCoachReply(stats, 'I keep getting distracted, any advice?')).toBeNull();
    expect(instantCoachReply(stats, 'Help me write my daily standup update')).toBeNull();
    expect(instantCoachReply(stats, 'summarize my day', {
      total: 2 * 3600 + 38 * 60,
      nonEffective: 6 * 60,
    })).toMatch(/Total time is 2 hours 38 min/);
    expect(instantCoachReply(stats, 'What is the capital of France?')).toBeNull();
    expect(instantCoachReply(stats, '2+2')).toMatch(/i am your work coach/i);
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

  it('reuses a fresh Cognito token instead of signing in again', async () => {
    const { resolveCoachIdToken } = require('../assistant-coach');
    const ipcRenderer = {
      invoke: jest.fn(async (channel) => {
        if (channel === 'get-config') return { cognito_client_id: 'client' };
        if (channel === 'load-user-session') return { refresh_token: 'refresh', id: '42' };
        return null;
      }),
    };
    const cognitoAuth = {
      hydrateCognitoSessionFromDisk: jest.fn(),
      getCurrentCognitoSession: jest.fn().mockResolvedValue({
        idToken: 'fresh-id',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 3600_000,
      }),
    };
    const previous = global.localStorage;
    global.localStorage = { getItem: () => JSON.stringify({ id: '42', organization_id: '10' }) };
    await resolveCoachIdToken(ipcRenderer, cognitoAuth);
    await resolveCoachIdToken(ipcRenderer, cognitoAuth);
    expect(cognitoAuth.getCurrentCognitoSession).toHaveBeenCalledTimes(1);
    global.localStorage = previous;
  });

  it('writes the live tray total into the opening, not the older Pulse total', () => {
    const { liveOpening } = require('../assistant-coach');
    const text = liveOpening({
      tracked_hours: 2.5,
      effective_hours: 2.4,
      non_effective_hours: 0.1,
      hours_threshold: 7,
      coaching: {
        week_hours_worked: 10,
        week_effective_hours: 9,
        week_non_effective_hours: 1,
        week_expected_hours: 14,
        weekly_target_hours: 35,
        completed_weekdays: 2,
        month_hours_worked: 40,
        month_effective_hours: 38,
        month_non_effective_hours: 2,
        month_expected_hours: 70,
        month_target_hours: 154,
        month_completed_weekdays: 10,
      },
    }, {
      live: { total: 2 * 3600 + 38 * 60, nonEffective: 6 * 60 },
    });
    expect(text).toContain('2 hours 38 min total time');
    expect(text).not.toContain('2 hours 30 min');
    expect(text).not.toMatch(/idle|daily target/i);
  });

  it('replaces the first message when refresh is forced', async () => {
    const ipcRenderer = {
      invoke: jest.fn(async (channel) => {
        if (channel === 'assistant:briefing') {
          return {
            success: true,
            data: {
              date: '2026-10-15',
              opening: 'Today, you tracked 2 hours 30 min',
              briefing: {},
              stats: {
                tracked_hours: 2.5,
                effective_hours: 2.4,
                non_effective_hours: 0.1,
                coaching: {},
              },
            },
          };
        }
        return null;
      }),
    };
    const { resetCoachAuthCacheForTests } = require('../assistant-coach');
    resetCoachAuthCacheForTests();
    const coach = new AssistantCoach(ipcRenderer);
    coach.dateKey = '2026-10-15';
    coach.todayKey = () => '2026-10-15';
    coach.history = [{ role: 'assistant', content: 'Today, you tracked 2 hours 30 min' }];
    coach.isCoachPageOpen = () => true;
    const previousWindow = global.window;
    const previousDocument = global.document;
    global.window = {
      __effectiveStatsReady: true,
      __todayTrackedSeconds: 2 * 3600 + 38 * 60,
      __todayNonEffectiveSeconds: 6 * 60,
    };
    global.document = {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    try {
      await coach.refresh({ force: true });
    } finally {
      global.window = previousWindow;
      global.document = previousDocument;
    }
    expect(coach.history[0].content).toContain('2 hours 38 min total time');
    expect(coach.history[0].content).not.toContain('2 hours 30 min');
  });

  it('does not reload the opening chat when Coach is opened again', async () => {
    const ipcRenderer = { invoke: jest.fn() };
    const coach = new AssistantCoach(ipcRenderer);
    coach.dateKey = '2026-10-08';
    coach.history = [{ role: 'assistant', content: 'This month…' }];
    coach._lastPayload = { date: '2026-10-08', opening: 'This month…' };
    coach.refresh = jest.fn();
    coach.setBusy = jest.fn();
    coach.bindOnce = jest.fn();
    coach.hasPaintedBriefing = () => true;

    coach.open();
    expect(coach.refresh).toHaveBeenCalledWith({ silent: true });
    expect(ipcRenderer.invoke).not.toHaveBeenCalledWith('assistant:briefing', expect.anything());
  });
});
