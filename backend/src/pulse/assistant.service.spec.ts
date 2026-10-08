import { describe, expect, it, vi } from 'vitest';
import { AssistantService } from './assistant.service';

function pulseDay(overrides?: Record<string, unknown>) {
  return {
    timezone: 'America/Los_Angeles',
    hours_threshold: 7,
    employees: [
      {
        employee_id: '4',
        days: [
          {
            date: '2026-09-17',
            tracked_hours: 2,
            adjustment_hours: 0,
            hours_worked: 2,
            low_activity_hours: 0.2,
            idle_hours: 0.5,
            non_effective_hours: 0.7,
            effective_hours: 1.3,
            below_threshold: true,
            ...overrides,
          },
        ],
      },
    ],
  };
}

function makeService(opts?: { configured?: boolean; pulseDay?: ReturnType<typeof pulseDay> | { employees: never[] } }) {
  const db = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('ext.workspace_id')) {
        return { rows: [{ organization_id: '10' }] };
      }
      if (sql.includes('FROM time_doctor.time_logs')) {
        return {
          rows: [
            {
              start_time: '2026-09-01T16:00:00.000Z',
              end_time: '2026-09-01T20:00:00.000Z',
              last_alive_at: null,
              deducted_seconds: 0,
              project_name: 'Pulse',
            },
            {
              start_time: '2026-09-17T16:00:00.000Z',
              end_time: '2026-09-17T18:00:00.000Z',
              last_alive_at: null,
              deducted_seconds: 0,
              project_name: 'Pulse',
            },
          ],
        };
      }
      if (sql.includes('COUNT(*)::text AS total')) {
        return {
          rows: [
            {
              total: '0',
              analyzed: '0',
              pending: '0',
              failed: '0',
              avg_activity: null,
            },
          ],
        };
      }
      return { rows: [] };
    }),
  };
  const pulse = {
    getOrgSettings: vi.fn(async () => ({
      hours_threshold: 7,
      low_activity_threshold: 10,
      screenshot_interval_minutes: 10,
      timezone: 'America/Los_Angeles',
      organization_id: '10',
    })),
    getDailyHours: vi.fn(async (_user, _start, _end, restrictToUserId?: string) => {
      const payload = opts?.pulseDay ?? pulseDay();
      const employees = (payload as { employees?: Array<{ employee_id?: string }> }).employees || [];
      if (!employees.length) return payload;
      const employeeId = String(restrictToUserId || employees[0]?.employee_id || '');
      return {
        ...payload,
        employees: employees.map((emp) => ({ ...emp, employee_id: employeeId })),
      };
    }),
    getProjectHours: vi.fn(async () => ({ projects: [{ name: 'Pulse', hours: 2 }] })),
  };
  const effectiveTime = {
    idleAndLowActivitySecondsForUser: vi.fn(async () => ({
      idleSeconds: 1800,
      lowActivitySeconds: 720,
      daily: {
        '2026-09-17': { idleSeconds: 1800, lowActivitySeconds: 720 },
      },
    })),
  };
  const deepseek = {
    isConfigured: vi.fn(() => opts?.configured === true),
    chatJson: vi.fn(async () => ({
      parsed: {
        greeting: 'Hello',
        summary: 'LLM summary',
        effective_breakdown: 'LLM effective',
        screenshot_insights: 'LLM shots',
        suggestions: ['Do this'],
      },
    })),
  };
  return {
    service: new AssistantService(
      db as never,
      pulse as never,
      effectiveTime as never,
      deepseek as never,
    ),
    db,
    pulse,
    effectiveTime,
    deepseek,
  };
}

describe('AssistantService', () => {
  it('uses Pulse Team Time hours when the employee day exists', async () => {
    const { service, deepseek, effectiveTime, pulse } = makeService({
      configured: false,
      pulseDay: pulseDay({ tracked_hours: 6.3, hours_worked: 6.3, idle_hours: 0.5, low_activity_hours: 0.2 }),
    });
    const result = await service.briefing({ id: '4', organization_id: '10' }, '2026-09-17');
    expect(pulse.getDailyHours).toHaveBeenCalledWith(
      { id: '4', organization_id: '10' },
      '2026-09-01',
      '2026-09-17',
      '4',
    );
    expect(effectiveTime.idleAndLowActivitySecondsForUser).not.toHaveBeenCalled();
    expect(result.stats.hours_source).toBe('pulse_daily_hours');
    expect(result.stats.tracked_hours).toBe(6.3);
    expect(result.stats.effective_hours).toBe(5.6);
    expect(result.briefing.summary).toContain('6 hours 18 min');
    expect(result.briefing.summary).toMatch(/this month/i);
    expect(result.opening).toContain(result.briefing.greeting);
    expect(result.opening).toContain(result.briefing.summary);
    expect(deepseek.chatJson).not.toHaveBeenCalled();
  });

  it('falls back to synced sessions when Pulse has no employee row', async () => {
    const { service, effectiveTime } = makeService({
      configured: false,
      pulseDay: { employees: [] },
    });
    const result = await service.briefing({ id: '4', organization_id: '10' }, '2026-09-17');
    expect(effectiveTime.idleAndLowActivitySecondsForUser).toHaveBeenCalled();
    expect(result.stats.hours_source).toBe('synced_sessions');
    expect(result.stats.tracked_hours).toBe(2);
    expect(result.stats.idle_hours).toBe(0.5);
    expect(result.stats.coaching.month_hours_worked).toBe(6);
    expect(result.stats.coaching.month_effective_hours).toBe(5.3);
  });

  it('sums month effective across Pulse days, not only the selected day', async () => {
    const { service } = makeService({
      configured: false,
      pulseDay: {
        timezone: 'America/Los_Angeles',
        hours_threshold: 7,
        employees: [
          {
            employee_id: '4',
            days: [
              {
                date: '2026-09-01',
                tracked_hours: 8,
                adjustment_hours: 0,
                hours_worked: 8,
                low_activity_hours: 0,
                idle_hours: 0,
                non_effective_hours: 0,
                effective_hours: 8,
                below_threshold: false,
              },
              {
                date: '2026-09-16',
                tracked_hours: 12.3,
                adjustment_hours: 0,
                hours_worked: 12.3,
                low_activity_hours: 0,
                idle_hours: 1.1,
                non_effective_hours: 1.1,
                effective_hours: 11.2,
                below_threshold: false,
              },
            ],
          },
        ],
      },
    });
    const result = await service.briefing({ id: '4', organization_id: '10' }, '2026-09-16');
    expect(result.stats.hours_source).toBe('pulse_daily_hours');
    expect(result.stats.effective_hours).toBe(11.2);
    expect(result.stats.coaching.month_effective_hours).toBe(19.2);
    expect(result.briefing.summary).toMatch(/19 hours 12 min effective/i);
  });

  it('uses LLM copy when configured', async () => {
    const { service, deepseek } = makeService({ configured: true });
    const result = await service.briefing({ id: '4', organization_id: '10' }, '2026-09-17');
    expect(result.briefing.summary).toBe('LLM summary');
    expect(deepseek.chatJson).toHaveBeenCalled();
    const prompt = String(deepseek.chatJson.mock.calls[0][0].userContent);
    expect(prompt).toContain('FACTS (copy hour labels exactly');
    expect(prompt).toContain('Tracked (timer): 2 hours');
    expect(prompt).toContain('This is their first chat message.');
    expect(prompt).toContain('Month-to-date');
  });

  it('reuses the opening copy when hours have not moved', async () => {
    const { service, deepseek } = makeService({ configured: true });
    await service.briefing({ id: '4', organization_id: '10' }, '2026-09-17');
    await service.briefing({ id: '4', organization_id: '10' }, '2026-09-17');
    expect(deepseek.chatJson).toHaveBeenCalledTimes(1);
  });

  it('restores a super-admin home workspace so desktop Coach does not need the company picker', async () => {
    const { service, pulse, db } = makeService({ configured: false });
    await service.briefing({ id: '9', is_super_admin: true }, '2026-09-17');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('ext.workspace_id'),
      [9],
    );
    expect(pulse.getDailyHours).toHaveBeenCalledWith(
      { id: '9', is_super_admin: true, organization_id: '10' },
      '2026-09-01',
      '2026-09-17',
      '9',
    );
  });

  it('answers 2+2 directly instead of quoting recorded hours', async () => {
    const { service, deepseek } = makeService({ configured: true });
    const result = await service.chat(
      { id: '4', organization_id: '10' },
      { date: '2026-09-17', message: '2+2' },
    );
    expect(result.reply).toBe('2 + 2 is 4.');
    expect(result.reply).not.toMatch(/effective|tracked|idle/i);
    expect(deepseek.chatJson).not.toHaveBeenCalled();
  });

  it('does not send the time record when the question is not about work', async () => {
    const { service, deepseek } = makeService({ configured: true });
    deepseek.chatJson.mockResolvedValueOnce({
      parsed: {
        greeting: 'Sure.',
        summary: 'Paris.',
        effective_breakdown: '',
        screenshot_insights: '',
        suggestions: [],
      },
    });
    const result = await service.chat(
      { id: '4', organization_id: '10' },
      { date: '2026-09-17', message: 'What is the capital of France?' },
    );
    expect(result.reply).toBe('Paris.');
    const prompt = String(deepseek.chatJson.mock.calls[0][0].userContent);
    expect(prompt).toContain('RETRIEVED PASSAGES: none.');
    expect(prompt).not.toMatch(/Effective time:/);
    expect(prompt).toContain('What is the capital of France?');
  });

  it('answers a follow-up instead of repeating the month opening', async () => {
    const { service } = makeService({ configured: false });
    const result = await service.chat(
      { id: '4', organization_id: '10' },
      { date: '2026-09-17', message: 'what is my effective time today?' },
    );
    expect(result.reply).toMatch(/today your effective time is/i);
    expect(result.reply).not.toMatch(/ask me about idle/i);
    expect(result.reply).not.toMatch(/this month \(september/i);
  });

  it('rejects an LLM month dump on follow-up and keeps the direct answer', async () => {
    const { service, deepseek } = makeService({ configured: true });
    deepseek.chatJson.mockResolvedValueOnce({
      parsed: {
        greeting: 'Here is your month so far.',
        summary:
          'This month (September 2026) you have 0 min effective vs 77 hours expected so far, toward 154 hours for the month. Today you tracked 2 hours across 1 session. Ask me about idle, screenshots, or how to catch up.',
        effective_breakdown: 'dump',
        screenshot_insights: 'dump',
        suggestions: [],
      },
    });
    const result = await service.chat(
      { id: '4', organization_id: '10' },
      { date: '2026-09-17', message: 'what is my non-effective time for today?' },
    );
    expect(result.reply).toMatch(/today your non-effective time is/i);
    expect(result.reply).not.toMatch(/ask me about idle/i);
  });

  it('lets the model answer from facts and history instead of rephrasing a canned script', async () => {
    const { service, deepseek } = makeService({ configured: true });
    deepseek.chatJson.mockResolvedValueOnce({
      parsed: {
        greeting: 'Got it.',
        summary:
          'Most of your captures were in Cursor, with two on-task coding windows and one off-task video tab. I do not see a video-meeting capture on this day.',
        effective_breakdown: 'LLM effective',
        screenshot_insights: 'LLM shots',
        suggestions: ['Keep personal tabs off the tracked screen.'],
      },
    });
    const result = await service.chat(
      { id: '4', organization_id: '10' },
      {
        date: '2026-09-17',
        message: 'what was I doing in Cursor?',
        history: [
          { role: 'assistant', content: 'Here is your month so far.' },
          { role: 'user', content: 'what is my effective time today?' },
        ],
      },
    );
    expect(result.reply).toMatch(/cursor/i);
    expect(result.reply).not.toMatch(/today your effective time is/i);
    expect(deepseek.chatJson).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.4,
        maxTokens: 800,
      }),
    );
    const prompt = String(deepseek.chatJson.mock.calls[0][0].userContent);
    expect(prompt).not.toMatch(/Rephrase ANSWER/);
    expect(prompt).not.toMatch(/\nANSWER:/);
    expect(prompt).toContain('Their latest question: what was I doing in Cursor?');
    expect(prompt).toContain('Recent conversation:');
    expect(prompt).toContain('user: what is my effective time today?');
  });

  it('rejects an LLM follow-up that invents hour totals', async () => {
    const { service, deepseek } = makeService({ configured: true });
    deepseek.chatJson.mockResolvedValueOnce({
      parsed: {
        greeting: 'Here.',
        summary: 'You have 99 hours effective today.',
        effective_breakdown: 'dump',
        screenshot_insights: 'dump',
        suggestions: [],
      },
    });
    const result = await service.chat(
      { id: '4', organization_id: '10' },
      { date: '2026-09-17', message: 'what is my effective time today?' },
    );
    expect(result.reply).toMatch(/today your effective time is/i);
    expect(result.reply).not.toMatch(/99 hours/);
  });
});
