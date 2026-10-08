import { describe, expect, it } from 'vitest';
import {
  buildCanonicalFacts,
  buildStats,
  compactStatsForPrompt,
  emptyScreenshotStats,
  answerArithmetic,
  answerCoachQuestion,
  classifyCoachQuestion,
  retrieveCoachPassages,
  fallbackBriefing,
  formatChatHistory,
  looksLikeOpeningDump,
  monthLabelFromDateKey,
  openingMessage,
  parseAssistantCopy,
  parseAssistantDate,
  replyHasInventedHours,
  sampleScreenshotInsights,
  sanitizeChatHistory,
  sessionsFromLogs,
  sumPulseDayHours,
  trackedHoursFromLogs,
  weekMonthPaceFromDays,
} from './assistant-briefing';

describe('assistant briefing helpers', () => {
  it('accepts work-calendar dates only', () => {
    expect(parseAssistantDate('2026-09-17')).toBe('2026-09-17');
    expect(parseAssistantDate('17-09-2026')).toBeNull();
    expect(parseAssistantDate('')).toBeNull();
  });

  it('keeps only recent user/assistant chat turns', () => {
    const history = sanitizeChatHistory([
      { role: 'system', content: 'ignore' },
      { role: 'user', content: '  hello  ' },
      { role: 'assistant', content: 'hi' },
      { role: 'user', content: '' },
    ]);
    expect(history).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ]);
  });

  it('merges overlapping sessions clipped to the work day', () => {
    const logs = [
      {
        start_time: '2026-09-17T16:00:00.000Z', // 09:00 Pacific
        end_time: '2026-09-17T20:00:00.000Z',
        deducted_seconds: 0,
      },
      {
        start_time: '2026-09-17T19:00:00.000Z',
        end_time: '2026-09-17T21:00:00.000Z',
        deducted_seconds: 0,
      },
    ];
    const result = trackedHoursFromLogs(logs, '2026-09-17', 'America/Los_Angeles');
    expect(result.hours).toBe(5);
    expect(result.sessionCount).toBe(2);
  });

  it('subtracts screenshot deductions on the session-start day only', () => {
    const logs = [
      {
        start_time: '2026-09-16T22:00:00.000Z', // 15:00 Pacific 16th
        end_time: '2026-09-17T18:00:00.000Z',
        deducted_seconds: 3600,
      },
    ];
    const sixteenth = trackedHoursFromLogs(logs, '2026-09-16', 'America/Los_Angeles');
    const seventeenth = trackedHoursFromLogs(logs, '2026-09-17', 'America/Los_Angeles');
    expect(sixteenth.hours).toBe(8); // 15:00-midnight minus 1h deduction
    expect(seventeenth.hours).toBe(11); // midnight-11:00, deduction stays on the 16th
  });

  it('builds a work-timezone session timeline', () => {
    const sessions = sessionsFromLogs(
      [
        {
          start_time: '2026-09-17T16:12:00.000Z',
          end_time: '2026-09-17T18:12:00.000Z',
          project_name: 'Pulse',
        },
      ],
      '2026-09-17',
      'America/Los_Angeles',
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].project).toBe('Pulse');
    expect(sessions[0].duration_label).toBe('2 hours');
    expect(sessions[0].open).toBe(false);
  });

  it('keeps distraction screenshot samples when truncating', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      time: `${i}:00`,
      app_name: 'Cursor',
      window_title: 'file.ts',
      activity_type: 'development',
      category: i === 7 ? 'distraction' : 'productive',
      activity_percent: 80,
      productivity_flag: i === 7 ? 'off_task' : 'on_task',
      is_meeting: false,
      description: i === 7 ? 'Social feed' : 'Coding',
      feedback: null,
    }));
    const samples = sampleScreenshotInsights(rows, 8);
    expect(samples.some((row) => row.category === 'distraction')).toBe(true);
  });

  it('parses LLM copy and drops empty suggestions', () => {
    const copy = parseAssistantCopy({
      greeting: 'Good afternoon.',
      summary: 'You tracked 6 hours.',
      effective_breakdown: 'Effective 5.2 hours.',
      screenshot_insights: 'Mostly development.',
      suggestions: ['Stop the timer when you leave.', '', 'Keep meetings on the tracked display.'],
    });
    expect(copy?.suggestions).toEqual([
      'Stop the timer when you leave.',
      'Keep meetings on the tracked display.',
    ]);
  });

  it('feeds canonical hour labels so the model cannot re-round', () => {
    const stats = buildStats({
      date: '2026-09-17',
      timezone: 'America/Los_Angeles',
      hoursSource: 'pulse_daily_hours',
      hoursThreshold: 7,
      trackedHours: 6.3,
      adjustmentHours: 0,
      hoursWorked: 6.3,
      sessionCount: 1,
      idleHours: 0.5,
      lowActivityHours: 0.2,
      projects: [{ name: 'Pulse', hours: 6.3 }],
      screenshots: {
        ...emptyScreenshotStats(),
        total: 4,
        analyzed: 3,
        productive: 2,
        distraction: 1,
        top_apps: [{ name: 'Cursor', count: 3 }],
      },
      monthPace: {
        effectiveHours: 40,
        hoursWorked: 48,
        nonEffectiveHours: 8,
        weekdaysCounted: 13,
        completedWeekdays: 12,
        remainingWeekdays: 9,
        weekdaysInMonth: 22,
        monthLabel: 'September 2026',
      },
    });
    const facts = buildCanonicalFacts(stats).join(' ');
    expect(facts).toContain('Tracked (timer): 6 hours 18 min');
    expect(facts).toContain('Effective: 5 hours 36 min');
    expect(facts).toContain('their official recorded day');
    expect(facts).toContain('Month-to-date (September 2026');
    expect(facts).not.toMatch(/\b(payroll|Team Time|the employee)\b/i);
    const compact = compactStatsForPrompt(stats);
    expect(compact.tracked).toBe('6 hours 18 min');
    expect(compact.effective).toBe('5 hours 36 min');
    const copy = fallbackBriefing(stats);
    expect(copy.summary).toContain('This month (September 2026)');
    expect(copy.summary).toContain('Today you tracked');
    expect(copy.summary).toContain('6 hours 18 min');
    expect(copy.summary).toContain('Pulse');
    expect(copy.greeting).toBe('Here is your month so far.');
    expect(openingMessage(copy)).toContain(copy.greeting);
    expect(openingMessage(copy)).toContain(copy.summary);
    expect(monthLabelFromDateKey('2026-09-17')).toBe('September 2026');
  });

  it('coaches on high idle without inventing a second cause', () => {
    const stats = buildStats({
      date: '2026-09-17',
      timezone: 'America/Los_Angeles',
      hoursSource: 'pulse_daily_hours',
      hoursThreshold: 7,
      trackedHours: 6,
      hoursWorked: 6,
      sessionCount: 1,
      idleHours: 2,
      lowActivityHours: 0.2,
      projects: [],
      screenshots: emptyScreenshotStats(),
      weekPace: {
        effectiveHours: 10,
        hoursWorked: 12,
        nonEffectiveHours: 2,
        weekdaysCounted: 3,
        completedWeekdays: 3,
        remainingWeekdays: 2,
        weeklyTargetHours: 35,
      },
    });
    expect(stats.coaching.primary_non_effective_cause).toBe('idle');
    expect(stats.coaching.headline).toMatch(/your non-effective time is idle/i);
    expect(stats.coaching.tips.some((tip) => /you have .* idle/i.test(tip))).toBe(true);
    expect(stats.coaching.tips.join(' ')).not.toMatch(/\bPulse\b/);
    expect(stats.coaching.week_expected_hours).toBe(21);
    expect(stats.coaching.completed_weekdays).toBe(3);
    const facts = buildCanonicalFacts(stats).join(' ');
    expect(facts).toContain('Primary non-effective cause: idle');
    expect(facts).toContain('Coaching tips:');
  });

  it('sums week and month effective from Pulse days instead of only today', () => {
    const days = [
      { date: '2026-09-01', effective_hours: 8, hours_worked: 8, non_effective_hours: 0 },
      { date: '2026-09-15', effective_hours: 7, hours_worked: 8, non_effective_hours: 1 },
      { date: '2026-09-16', effective_hours: 11.2, hours_worked: 12.3, non_effective_hours: 1.1 },
    ];
    expect(sumPulseDayHours(days, ['2026-09-16'])).toEqual({
      effectiveHours: 11.2,
      hoursWorked: 12.3,
      nonEffectiveHours: 1.1,
    });
    const { weekPace, monthPace } = weekMonthPaceFromDays(days, '2026-09-16', 'America/Chicago', '2026-09-16');
    expect(weekPace?.effectiveHours).toBe(18.2);
    expect(weekPace?.completedWeekdays).toBe(2);
    expect(monthPace?.effectiveHours).toBe(26.2);
    expect(monthPace?.completedWeekdays).toBe(11);
  });

  it('answers follow-up questions instead of repeating the month opening', () => {
    const stats = buildStats({
      date: '2026-09-16',
      timezone: 'America/Chicago',
      hoursSource: 'pulse_daily_hours',
      hoursThreshold: 7,
      trackedHours: 12.3,
      hoursWorked: 12.3,
      sessionCount: 15,
      idleHours: 1.1,
      lowActivityHours: 0,
      projects: [{ name: 'Data Engineering', hours: 12.3 }],
      screenshots: emptyScreenshotStats(),
      monthPace: {
        effectiveHours: 43.1,
        hoursWorked: 48,
        nonEffectiveHours: 4.9,
        weekdaysCounted: 12,
        completedWeekdays: 11,
        remainingWeekdays: 10,
        weekdaysInMonth: 22,
        monthLabel: 'September 2026',
      },
    });
    expect(classifyCoachQuestion('what is my effective time today?')).toBe('effective_today');
    expect(classifyCoachQuestion('what is my non-effective time for today?')).toBe('non_effective_today');
    expect(classifyCoachQuestion('Month so far')).toBe('month');
    expect(classifyCoachQuestion('what was I doing today?')).toBe('screenshots');
    expect(classifyCoachQuestion('was I in a Zoom meeting?')).toBe('meetings');
    expect(looksLikeOpeningDump(fallbackBriefing(stats).summary)).toBe(true);
    const effective = answerCoachQuestion(stats, 'what is my effective time today?');
    expect(effective).toMatch(/today your effective time is 11 hours 12 min/i);
    expect(effective).not.toMatch(/ask me about idle/i);
    expect(effective).not.toMatch(/43 hours/i);
    const nonEffective = answerCoachQuestion(stats, 'what is my non-effective time for today?');
    expect(nonEffective).toMatch(/today your non-effective time is 1 hour 6 min/i);
    expect(nonEffective).not.toMatch(/ask me about idle/i);
    const unknown = answerCoachQuestion(stats, 'can you help me with something else?');
    expect(unknown).toMatch(/i can answer from your recorded day/i);
    expect(unknown).not.toMatch(/today your effective time is/i);
    expect(answerArithmetic('2+2')).toBe('2 + 2 is 4.');
    expect(answerCoachQuestion(stats, '2+2')).toBe('2 + 2 is 4.');
    expect(answerCoachQuestion(stats, 'what is 2 + 2?')).toBe('2 + 2 is 4.');
    expect(retrieveCoachPassages(stats, 'what is my effective time?').join(' ')).toMatch(/effective time/i);
    expect(retrieveCoachPassages(stats, 'What is the capital of France?')).toEqual([]);
    const withCursor = buildStats({
      date: '2026-09-16',
      timezone: 'America/Chicago',
      hoursSource: 'pulse_daily_hours',
      hoursThreshold: 7,
      trackedHours: 2,
      sessionCount: 1,
      idleHours: 0,
      lowActivityHours: 0,
      projects: [],
      screenshots: {
        ...emptyScreenshotStats(),
        total: 1,
        analyzed: 1,
        top_apps: [{ name: 'Cursor', count: 1 }],
        samples: [
          {
            time: '9:00 AM',
            app_name: 'Cursor',
            window_title: 'assistant.ts',
            activity_type: 'coding',
            category: 'productive',
            activity_percent: 80,
            productivity_flag: 'on_task',
            is_meeting: false,
            description: 'Editing the coach prompt',
            feedback: null,
          },
        ],
      },
    });
    expect(retrieveCoachPassages(withCursor, 'what was I doing in Cursor?').join(' ')).toMatch(/cursor/i);
    const named = answerCoachQuestion(stats, 'how much time on Data Engineering?');
    expect(named).toMatch(/data engineering/i);
    expect(named).toMatch(/12 hours 18 min/i);
  });

  it('formats recent chat turns for the model', () => {
    expect(
      formatChatHistory([
        { role: 'assistant', content: 'Here is your month so far.' },
        { role: 'user', content: 'what was I doing?' },
      ]),
    ).toBe('assistant: Here is your month so far.\nuser: what was I doing?');
  });

  it('names screenshot samples and rejects invented hour totals', () => {
    const stats = buildStats({
      date: '2026-09-16',
      timezone: 'America/Chicago',
      hoursSource: 'pulse_daily_hours',
      hoursThreshold: 7,
      trackedHours: 8,
      hoursWorked: 8,
      sessionCount: 1,
      idleHours: 0.5,
      lowActivityHours: 0,
      projects: [{ name: 'Pulse', hours: 8 }],
      screenshots: {
        ...emptyScreenshotStats(),
        total: 4,
        analyzed: 4,
        productive: 3,
        distraction: 1,
        top_apps: [{ name: 'Cursor', count: 3 }],
        samples: [
          {
            time: '10:12 AM',
            app_name: 'Cursor',
            window_title: 'assistant.service.ts',
            activity_type: 'development',
            category: 'productive',
            activity_percent: 80,
            productivity_flag: 'on_task',
            is_meeting: false,
            description: 'Editing TypeScript in the Pulse assistant service',
            feedback: null,
          },
          {
            time: '2:04 PM',
            app_name: 'YouTube',
            window_title: 'Home',
            activity_type: 'browsing',
            category: 'distraction',
            activity_percent: 5,
            productivity_flag: 'off_task',
            is_meeting: false,
            description: 'Watching a video feed',
            feedback: null,
          },
        ],
      },
    });
    const shots = answerCoachQuestion(stats, 'what was I doing today?');
    expect(shots).toMatch(/cursor/i);
    expect(shots).toMatch(/watching a video feed/i);
    expect(replyHasInventedHours(stats, 'Your effective time is 7 hours 30 min.')).toBe(false);
    expect(replyHasInventedHours(stats, 'You have 99 hours effective today.')).toBe(true);
    expect(replyHasInventedHours(stats, 'You have 7.5 hours effective today.')).toBe(true);
  });
});
