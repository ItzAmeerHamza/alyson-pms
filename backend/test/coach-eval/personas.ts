/**
 * Coach eval fixtures: four user profiles, the questions real users ask a
 * personal work assistant, and an automatic grader for the replies.
 * Used by routing.spec.ts (offline, in `npm test`) and run.ts (live model).
 */
import {
  AssistantStats,
  buildStats,
  emptyScreenshotStats,
  OFF_TOPIC_COACH_REPLY,
} from '../../src/pulse/assistant-briefing';


function shots(over: Partial<AssistantStats['screenshots']>): AssistantStats['screenshots'] {
  return { ...emptyScreenshotStats(), ...over };
}

const week = (eff: number, worked: number, done: number) => ({
  effectiveHours: eff, hoursWorked: worked, nonEffectiveHours: worked - eff,
  weekdaysCounted: done + 1, completedWeekdays: done, remainingWeekdays: 4 - done, weeklyTargetHours: 35,
});
const month = (eff: number, worked: number, done: number) => ({
  effectiveHours: eff, hoursWorked: worked, nonEffectiveHours: worked - eff,
  weekdaysCounted: done + 1, completedWeekdays: done, remainingWeekdays: 22 - done - 1,
  weekdaysInMonth: 22, monthLabel: 'October 2026',
});

const base = { date: '2026-10-19', timezone: 'America/New_York', hoursSource: 'pulse_daily_hours' as const, hoursThreshold: 7 };

export const PERSONAS: Record<string, AssistantStats> = {
  on_track: buildStats({
    ...base, trackedHours: 7.4, sessionCount: 2, idleHours: 0.2, lowActivityHours: 0.1,
    sessions: [
      { start: '9:02 AM', end: '12:31 PM', duration_label: '3 hours 29 min', project: 'Website', open: false },
      { start: '1:15 PM', end: '5:10 PM', duration_label: '3 hours 55 min', project: 'Website', open: false },
    ],
    projects: [{ name: 'Website', hours: 7.4 }],
    screenshots: shots({
      total: 44, analyzed: 44, productive: 40, neutral: 3, distraction: 1, meeting: 2, avg_activity_percent: 71,
      activity_types: [{ type: 'coding', count: 30 }], top_apps: [{ name: 'VS Code', count: 30 }, { name: 'Chrome', count: 10 }],
      samples: [
        { time: '9:40 AM', app_name: 'VS Code', window_title: 'checkout.tsx', activity_type: 'coding', category: 'productive', activity_percent: 82, productivity_flag: 'on_task', is_meeting: false, description: 'Editing checkout form validation', feedback: null },
        { time: '2:10 PM', app_name: 'Zoom', window_title: 'Sprint review', activity_type: 'meeting', category: 'productive', activity_percent: 20, productivity_flag: 'on_task', is_meeting: true, description: 'Sprint review call', feedback: null },
      ],
    }),
    weekPace: week(7.1, 7.4, 0), monthPace: month(84, 90, 12),
  }),
  idle_heavy: buildStats({
    ...base, trackedHours: 6, sessionCount: 3, idleHours: 2.1, lowActivityHours: 0.3,
    sessions: [
      { start: '8:30 AM', end: '11:00 AM', duration_label: '2 hours 30 min', project: 'Support', open: false },
      { start: '11:45 AM', end: '1:30 PM', duration_label: '1 hour 45 min', project: 'Support', open: false },
      { start: '2:00 PM', end: '3:45 PM', duration_label: '1 hour 45 min', project: 'Support', open: true },
    ],
    projects: [{ name: 'Support', hours: 6 }],
    screenshots: shots({
      total: 36, analyzed: 30, productive: 18, neutral: 8, distraction: 4, meeting: 0, avg_activity_percent: 34,
      activity_types: [{ type: 'email', count: 14 }], top_apps: [{ name: 'Zendesk', count: 15 }, { name: 'Slack', count: 9 }, { name: 'YouTube', count: 4 }],
      samples: [
        { time: '11:20 AM', app_name: 'YouTube', window_title: 'Lofi beats', activity_type: 'video', category: 'distraction', activity_percent: 0, productivity_flag: 'off_task', is_meeting: false, description: 'Music video playing, no work visible', feedback: 'Keep personal video off screen' },
        { time: '9:15 AM', app_name: 'Zendesk', window_title: 'Ticket #4411', activity_type: 'email', category: 'productive', activity_percent: 55, productivity_flag: 'on_task', is_meeting: false, description: 'Replying to customer ticket', feedback: null },
      ],
    }),
    weekPace: week(3.6, 6, 0), monthPace: month(61, 78, 12),
  }),
  low_activity_distracted: buildStats({
    ...base, trackedHours: 5, sessionCount: 2, idleHours: 0.2, lowActivityHours: 1.6,
    sessions: [
      { start: '10:00 AM', end: '12:30 PM', duration_label: '2 hours 30 min', project: 'Design', open: false },
      { start: '1:30 PM', end: '4:00 PM', duration_label: '2 hours 30 min', project: 'Design', open: false },
    ],
    projects: [{ name: 'Design', hours: 5 }],
    screenshots: shots({
      total: 30, analyzed: 30, productive: 14, neutral: 6, distraction: 10, meeting: 0, avg_activity_percent: 22,
      activity_types: [{ type: 'browsing', count: 15 }], top_apps: [{ name: 'Figma', count: 13 }, { name: 'Instagram', count: 7 }, { name: 'Reddit', count: 3 }],
      samples: [
        { time: '10:40 AM', app_name: 'Instagram', window_title: 'Instagram', activity_type: 'social', category: 'distraction', activity_percent: 5, productivity_flag: 'off_task', is_meeting: false, description: 'Scrolling social feed', feedback: 'Close social apps while tracking' },
        { time: '2:20 PM', app_name: 'Figma', window_title: 'Landing v3', activity_type: 'design', category: 'productive', activity_percent: 40, productivity_flag: 'on_task', is_meeting: false, description: 'Adjusting hero layout', feedback: null },
      ],
    }),
    weekPace: week(3.2, 5, 0), monthPace: month(55, 66, 12),
  }),
  // Mirrors a real report: Sunday, a short clean session, the week already done.
  weekend_clean: buildStats({
    date: '2026-10-18', timezone: 'America/Los_Angeles', hoursSource: 'pulse_daily_hours', hoursThreshold: 7,
    trackedHours: 1.4, sessionCount: 1, idleHours: 0, lowActivityHours: 0,
    sessions: [{ start: '3:40 PM', end: '5:04 PM', duration_label: '1 hour 24 min', project: 'Data Engineering', open: true }],
    projects: [{ name: 'Data Engineering', hours: 1.4 }],
    screenshots: shots({
      total: 8, analyzed: 8, productive: 7, neutral: 1, distraction: 0, meeting: 1, avg_activity_percent: 64,
      activity_types: [{ type: 'coding', count: 6 }], top_apps: [{ name: 'Cursor', count: 6 }, { name: 'Google Meet', count: 1 }],
      samples: [
        { time: '3:55 PM', app_name: 'Cursor', window_title: 'assistant.service.ts', activity_type: 'coding', category: 'productive', activity_percent: 70, productivity_flag: 'on_task', is_meeting: false, description: 'Debugging the alyson-time-doctor app', feedback: null },
        { time: '4:30 PM', app_name: 'Google Meet', window_title: 'Client 1:1', activity_type: 'meeting', category: 'productive', activity_percent: 15, productivity_flag: 'on_task', is_meeting: true, description: 'Client 1:1 video call', feedback: null },
      ],
    }),
    weekPace: { effectiveHours: 42.25, hoursWorked: 43.95, nonEffectiveHours: 1.7, weekdaysCounted: 5, completedWeekdays: 5, remainingWeekdays: 0, weeklyTargetHours: 35 },
    monthPace: { effectiveHours: 93.5, hoursWorked: 98.45, nonEffectiveHours: 4.8, weekdaysCounted: 12, completedWeekdays: 12, remainingWeekdays: 10, weekdaysInMonth: 22, monthLabel: 'October 2026' },
  }),
  not_started: buildStats({
    ...base, trackedHours: 0, sessionCount: 0, idleHours: 0, lowActivityHours: 0,
    projects: [], screenshots: shots({}), weekPace: week(0, 0, 0), monthPace: month(40, 46, 12),
  }),
};

export const QUESTIONS: Array<{ q: string; intent: string }> = [
  { q: 'How can I be more productive tomorrow?', intent: 'advice' },
  { q: 'What should I focus on for the rest of the day?', intent: 'plan' },
  { q: 'How many hours do I still need this week to hit my target?', intent: 'calc' },
  { q: 'What time should I keep working until to reach 7 hours effective today?', intent: 'calc' },
  { q: 'When was I most focused today?', intent: 'insight' },
  { q: 'Why is my effective time low?', intent: 'diagnose' },
  { q: 'Give me 3 tips to reduce my idle time', intent: 'advice' },
  { q: 'I keep getting distracted, any advice?', intent: 'advice' },
  { q: 'Which app distracts me the most?', intent: 'insight' },
  { q: 'Am I on track?', intent: 'status' },
  { q: 'Summarize my day', intent: 'status' },
  { q: 'Help me write my daily standup update', intent: 'assist' },
  { q: 'How was my week?', intent: 'status' },
  { q: 'I feel burned out and tired', intent: 'wellbeing' },
  { q: 'How should I take breaks so they do not hurt my numbers?', intent: 'advice' },
  { q: 'Plan my afternoon', intent: 'plan' },
  { q: 'What did I spend most of my time on?', intent: 'insight' },
  { q: 'Can I hit my monthly target? What do I need per day?', intent: 'calc' },
  { q: 'Was my morning better than my afternoon?', intent: 'insight' },
  { q: 'make me a schedule for tomorrow from 9 to 5', intent: 'plan' },
  { q: 'What is the capital of France?', intent: 'off_topic' },
];

export const NOW = Date.parse('2026-10-19T19:30:00Z'); // 3:30 PM in New York
const PERSONA_NOW: Record<string, number> = { weekend_clean: Date.parse('2026-10-19T00:07:00Z') }; // Sun 5:07 PM Pacific
export const nowFor = (persona: string) => PERSONA_NOW[persona] ?? NOW;
const DISTRACTING_APPS = ['Instagram', 'YouTube', 'Reddit', 'Facebook', 'TikTok', 'Twitter', 'Netflix', 'X.com'];

const TOP_OFF_TASK: Record<string, string> = { idle_heavy: 'YouTube', low_activity_distracted: 'Instagram' };

export function grade(persona: string, intent: string, route: string, reply: string, q: string) {
  const issues: string[] = [];
  const refused = reply === OFF_TOPIC_COACH_REPLY;
  if (intent === 'off_topic') return { ok: refused, issues: refused ? [] : ['answered off-topic'] };
  if (refused) issues.push('refused an on-topic question');
  if (/^I can help with your recorded day/.test(reply)) issues.push('generic help menu instead of an answer');
  if (route === 'model→rejected→fallback') issues.push('model reply rejected by the hour check');
  if (/\b(3|three|tips)\b/i.test(q) && (reply.match(/^- /gm) || []).length < 3) issues.push('asked for several tips, got fewer than 3 list items');
  if (intent === 'calc' && persona !== 'not_started' && !/weekend/i.test(reply) && !/\b(need|needed|left|remaining|per weekday|per day|around|until|already met|already reached|met your)\b/i.test(reply)) issues.push('did not say what is still needed');
  if (/distracts me the most/.test(q) && TOP_OFF_TASK[persona] && !reply.includes(TOP_OFF_TASK[persona])) issues.push(`did not name ${TOP_OFF_TASK[persona]}`);
  if (intent === 'wellbeing' && /\b(push through|work longer|keep going until)\b/i.test(reply.replace(/\b(don['’]t|do not|no need to|never) (have to )?(push through|work longer)/gi, ''))) issues.push('pressured a tired user to work more');
  if (/standup/.test(q) && persona !== 'not_started' && !/(Website|Support|Design|Data Engineering)/i.test(reply)) issues.push('standup does not mention their project');
  if (/\d+\.\d+\s*hours?/i.test(reply)) issues.push('decimal hours');
  const stats = PERSONAS[persona];
  const known = JSON.stringify(stats.screenshots).toLowerCase();
  for (const app of DISTRACTING_APPS) {
    if (reply.includes(app) && !known.includes(app.toLowerCase())) issues.push(`named ${app}, which is not in their record`);
  }
  if (/idle/i.test(q) && stats.idle_hours === 0 && stats.hours_worked > 0 && !/\b(no idle|0 min|zero|already|none)\b/i.test(reply)) issues.push('did not say they have no idle');
  if (/every 5 min/i.test(reply) && /alarm|reminder|check/i.test(reply)) issues.push('suggested a 5-min activity alarm');
  if (persona === 'weekend_clean' && /\b(1[0-1]|[8-9]):\d{2}\s?PM\b/.test(reply) && !/tomorrow/i.test(q)) issues.push('suggested working late on a weekend');
  if (persona === 'weekend_clean' && /what time should i keep working/i.test(q) && !/weekend|no daily target|nothing is expected|sunday/i.test(reply)) issues.push('ignored that today is a weekend');
  if (/schedule for tomorrow/i.test(q) && /\b([7-9]|1[01]):\d{2}\s?PM\b/.test(reply)) issues.push('schedule runs past 7 PM');
  if (persona === 'weekend_clean' && /(rest of the day|plan my afternoon)/i.test(q) && /\b(9|10|11):\d{2}\s?AM|\b[1-4]:\d{2}\s?PM/.test(reply)) issues.push('planned time that has already passed');
  if (/schedule for tomorrow from 9 to 5/i.test(q)) {
    const off = [...reply.matchAll(/(\d{1,2}):(\d{2})\s?(AM|PM)?\s?[–-]\s?(\d{1,2}):(\d{2})\s?(AM|PM)[^\n]*\b(break|lunch)\b[^\n]*timer (stopped|off)/gi)]
      .reduce((sum, m) => {
        const t = (h: string, mm: string, ap: string) => ((parseInt(h, 10) % 12) + (ap.toUpperCase() === 'PM' ? 12 : 0)) * 60 + parseInt(mm, 10);
        return sum + (t(m[4], m[5], m[6]) - t(m[1], m[2], m[3] || m[6]));
      }, 0);
    if (off > 60) issues.push(`schedule has ${off} min off the timer, so it misses 7 hours`);
  }
  if (/\b(they|their) (keep|start|reach)\b|do not suggest|do not push/i.test(reply)) issues.push('leaked an internal note');
  if (/standup/.test(q) && /\b(idle|low[- ]activity|instagram|youtube|reddit|distract\w*|off-task)\b/i.test(reply)) issues.push('standup leaks idle/distractions to the team');
  if (/standup/.test(q) && /\byesterday\b/i.test(reply)) issues.push('standup calls today "yesterday"');
  if (intent === 'wellbeing' && /\b(idle|effective)\b/i.test(reply.split('\n')[0])) issues.push('burnout reply opens with their metrics');
  if (/monthly target/.test(q) && persona === 'idle_heavy' && !/\b(stretch|realistic|tough|ambitious|challenging|hard|above|more than)\b/i.test(reply)) issues.push('did not flag an unrealistic per-day pace');
  if (/\b(lunch|break)\b[^.]*\b(too long|was long|long break)\b/i.test(reply)) issues.push('criticized a stopped-timer break');
  return { ok: issues.length === 0, issues };
}

