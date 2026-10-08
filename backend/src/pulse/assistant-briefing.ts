import { computeEffectiveTime } from '../lib/effective-time';
import { deductedHours, mergeTimeIntervals, sessionEndMs } from '../lib/time-merge';
import { workDateKey, workDayBoundsMs } from '../lib/work-timezone';
import { formatDecimalHours } from './format-hours';
import {
  WEEKLY_HOURS_TARGET,
  addCalendarDays,
  lastDayOfMonth,
  mondayKey,
  weekdayKeysInclusive,
} from './pacing-math';

export const ASSISTANT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type AssistantRole = 'user' | 'assistant';
export type AssistantHoursSource = 'pulse_daily_hours' | 'synced_sessions';

export interface AssistantChatTurn {
  role: AssistantRole;
  content: string;
}

export interface AssistantSession {
  start: string;
  end: string;
  duration_label: string;
  project: string | null;
  open: boolean;
}

export interface AssistantScreenshotSample {
  time: string;
  app_name: string | null;
  window_title: string | null;
  activity_type: string | null;
  category: string | null;
  activity_percent: number | null;
  productivity_flag: string | null;
  is_meeting: boolean;
  description: string | null;
  feedback: string | null;
}

export interface AssistantStats {
  date: string;
  timezone: string;
  hours_source: AssistantHoursSource;
  hours_threshold: number;
  tracked_hours: number;
  adjustment_hours: number;
  hours_worked: number;
  idle_hours: number;
  low_activity_hours: number;
  non_effective_hours: number;
  effective_hours: number;
  below_hours_worked_target: boolean;
  below_effective_target: boolean;
  session_count: number;
  first_start: string | null;
  last_end: string | null;
  sessions: AssistantSession[];
  projects: Array<{ name: string; hours: number }>;
  screenshots: {
    total: number;
    analyzed: number;
    pending: number;
    failed: number;
    productive: number;
    distraction: number;
    neutral: number;
    meeting: number;
    avg_activity_percent: number | null;
    activity_types: Array<{ type: string; count: number }>;
    productivity_flags: Array<{ flag: string; count: number }>;
    top_apps: Array<{ name: string; count: number }>;
    samples: AssistantScreenshotSample[];
  };
  coaching: AssistantCoaching;
}

export interface AssistantBriefingCopy {
  greeting: string;
  summary: string;
  effective_breakdown: string;
  screenshot_insights: string;
  suggestions: string[];
}

export type CoachingSeverity = 'ok' | 'watch' | 'behind';
export type NonEffectiveCause = 'none' | 'idle' | 'low_activity' | 'mixed' | 'not_tracking';

export interface AssistantCoaching {
  severity: CoachingSeverity;
  headline: string;
  non_effective_share: number;
  primary_non_effective_cause: NonEffectiveCause;
  week_effective_hours: number;
  week_expected_hours: number;
  week_hours_worked: number;
  weekdays_counted: number;
  completed_weekdays: number;
  remaining_weekdays: number;
  weekly_target_hours: number;
  month_label: string;
  month_effective_hours: number;
  month_expected_hours: number;
  month_hours_worked: number;
  month_weekdays_counted: number;
  month_completed_weekdays: number;
  month_remaining_weekdays: number;
  month_target_hours: number;
  tips: string[];
}

export interface AssistantWeekPace {
  effectiveHours: number;
  hoursWorked: number;
  nonEffectiveHours: number;
  weekdaysCounted: number;
  completedWeekdays: number;
  remainingWeekdays: number;
  weeklyTargetHours: number;
}

export interface AssistantMonthPace {
  effectiveHours: number;
  hoursWorked: number;
  nonEffectiveHours: number;
  weekdaysCounted: number;
  completedWeekdays: number;
  remainingWeekdays: number;
  weekdaysInMonth: number;
  monthLabel: string;
}

export interface AssistantPulseDay {
  date: string;
  tracked_hours: number;
  adjustment_hours: number;
  hours_worked: number;
  low_activity_hours: number;
  idle_hours: number;
  non_effective_hours: number;
  effective_hours: number;
  below_threshold: boolean;
}

export const ASSISTANT_SYSTEM_PROMPT = `You are Tavilo, the work coach in the Tavilo Time desktop app.

You are talking to the signed-in person about THEIR recorded time only. Visible replies must sound like a coach speaking to them, not a manager report about an employee.

You receive FACTS (authoritative) and STATS JSON (detail). FACTS win if anything conflicts. Those are private notes for you — never say “FACTS”, “STATS”, “Pulse”, “Team Time”, “payroll”, “HR”, or “the employee” in visible text.

Hard rules:
- Always you/your. Never third person (“the employee”, “this user”, “they tracked”).
- Never mention teammates, managers, other people’s hours, or company-wide reports.
- Copy hour labels from FACTS exactly (e.g. "5 hours 42 min"). Never re-round, convert, or estimate.
- Only mention apps, sites, window titles, or screenshot details that appear in FACTS or screenshot samples.
- If they ask for something not in FACTS/STATS, say you do not have that in their record for this month or day. Do not guess.
- Idle is time the computer sat still (≥ 5 min) while the timer was running. Low-activity is quiet screenshots below the company cutoff. Video meetings are work and are not low-activity.
- Effective time is hours worked minus idle and low-activity. Hours worked is timer time plus any leave or adjustment on their day. Their daily goal uses effective hours.
- Week pacing in FACTS is their week-to-date effective vs 7h × completed weekdays (today is excluded from expected while that day is still in progress). Weekly target is 35h.
- Month pacing in FACTS is month-to-date effective vs 7h × completed weekdays since the 1st (today excluded from expected while that day is still in progress). Month target is 7h × weekdays in that month.
- The opening briefing (when the instruction says this is their first chat message) must lead with their month-to-date summary, then a short snapshot of the selected day, and invite follow-up questions.
- Follow-up questions go in "summary" as a direct reply. Do not restart the month-to-date opening unless they ask about the month.
- Coaching tips in FACTS are the only allowed suggestions. You may rephrase them, but do not add new numbers, apps, or causes.
- If their non-effective time is high, say whether idle or low-activity is the larger share, and coach from that. Do not scold.
- Live tray time on their computer may still be catching up to the recorded day.
- Be specific and practical. Name apps, session times, and screenshot samples from FACTS when they help. Do not sound like a generic template.

Return JSON only:
{
  "greeting": "one short line to them",
  "summary": "2-4 sentences. For the opening briefing: month-to-date first (exact hour labels), then today’s snapshot. For chat: the direct reply",
  "effective_breakdown": "2-3 sentences on their effective vs idle vs low-activity using the exact labels, plus their week-to-date if present",
  "screenshot_insights": "2-4 sentences only from their screenshot counts and samples (meetings, on-task/off-task, notable vision descriptions)",
  "suggestions": ["up to 5 coaching tips copied/rephrased from FACTS coaching tips, written as advice to them"]
}`;

export const ASSISTANT_CHAT_SYSTEM_PROMPT = `You are Tavilo, the coach in the Tavilo Time desktop app. You can answer any question.

Retrieved passages are private notes about the signed-in person's recorded work for the selected day: hours, idle, sessions, projects, and screenshot descriptions. Recent conversation is also context.

Hard rules:
- Put the direct answer in "summary" in 2-5 sentences. Speak as you/your.
- Answer the question they actually asked.
- When the question is about their recorded work, use only the retrieved passages and the conversation. Copy hour labels exactly (e.g. "5 hours 42 min"). Never invent, re-round, or estimate totals.
- When the passages do not contain a work detail they asked for, say you do not have that in their record for this day. Do not substitute a different hour total.
- When the question is not about their work (math, general knowledge, small talk, how-to), answer it directly. Do not mention their hours, idle, screenshots, sessions, projects, or pacing.
- Do not restart a month-to-date opening unless they asked about the month. Do not say “Ask me about idle”.
- Never say “RETRIEVED”, “FACTS”, “STATS”, “Pulse”, “Team Time”, “payroll”, or “HR”.
- Greeting is one short acknowledgement.
- For a work question, keep effective_breakdown, screenshot_insights, and suggestions aligned with the passages. Otherwise leave them empty. Suggestions may only rephrase coaching tips that appear in the passages.

Return JSON only with greeting, summary, effective_breakdown, screenshot_insights, suggestions.`;

export function parseAssistantDate(value?: string | null): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return ASSISTANT_DATE_RE.test(raw) ? raw : null;
}

export function sanitizeChatHistory(
  history: Array<{ role?: unknown; content?: unknown }> | undefined,
  maxTurns = 8,
): AssistantChatTurn[] {
  if (!Array.isArray(history)) return [];
  const out: AssistantChatTurn[] = [];
  for (const turn of history.slice(-maxTurns)) {
    const role = turn?.role === 'assistant' ? 'assistant' : turn?.role === 'user' ? 'user' : null;
    const content = String(turn?.content || '').trim().slice(0, 2000);
    if (!role || !content) continue;
    out.push({ role, content });
  }
  return out;
}

export function formatChatHistory(history: AssistantChatTurn[] | undefined): string {
  const turns = Array.isArray(history) ? history.slice(-8) : [];
  if (!turns.length) return '';
  return turns.map((turn) => `${turn.role}: ${turn.content}`).join('\n');
}

export function formatWorkClock(value: string | Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value));
}

/**
 * Tracked hours for one work day. Matches Pulse: merge overlapping sessions
 * clipped to the day, then subtract screenshot-delete deductions from the
 * session-start work day (not the clipped day).
 */
export function trackedHoursFromLogs(
  logs: Array<{
    start_time: string | Date;
    end_time?: string | Date | null;
    last_alive_at?: string | Date | null;
    deducted_seconds?: number | null;
  }>,
  dateKey: string,
  tz: string,
): { hours: number; sessionCount: number } {
  const { startMs: dayStart, endMs: dayEnd } = workDayBoundsMs(dateKey, tz);
  const clipped: Array<{ startMs: number; endMs: number }> = [];
  let deducted = 0;
  for (const log of logs) {
    const startMs = new Date(log.start_time).getTime();
    const endMs = sessionEndMs(log);
    if (!Number.isFinite(startMs) || endMs <= startMs) continue;
    const clipStart = Math.max(startMs, dayStart);
    const clipEnd = Math.min(endMs, dayEnd);
    if (clipEnd > clipStart) clipped.push({ startMs: clipStart, endMs: clipEnd });
    if (workDateKey(log.start_time, tz) === dateKey) {
      deducted += deductedHours(log.deducted_seconds);
    }
  }
  const merged = mergeTimeIntervals(clipped);
  let totalMs = 0;
  for (const interval of merged) totalMs += interval.endMs - interval.startMs;
  const hours = Math.max(0, Math.round((totalMs / 3_600_000 - deducted) * 10) / 10);
  return { hours, sessionCount: clipped.length };
}

export function sameEmployeeId(employeeId: unknown, userId: string): boolean {
  return String(employeeId ?? '').trim() === String(userId ?? '').trim();
}

export function normalizePulseDay(raw: {
  date?: string;
  tracked_hours?: number;
  adjustment_hours?: number;
  hours_worked?: number;
  low_activity_hours?: number;
  idle_hours?: number;
  non_effective_hours?: number;
  effective_hours?: number;
  below_threshold?: boolean;
}): AssistantPulseDay {
  const date = String(raw.date || '').slice(0, 10);
  return {
    date,
    tracked_hours: Number(raw.tracked_hours) || 0,
    adjustment_hours: Number(raw.adjustment_hours) || 0,
    hours_worked: Number(raw.hours_worked) || 0,
    low_activity_hours: Number(raw.low_activity_hours) || 0,
    idle_hours: Number(raw.idle_hours) || 0,
    non_effective_hours: Number(raw.non_effective_hours) || 0,
    effective_hours: Number(raw.effective_hours) || 0,
    below_threshold: Boolean(raw.below_threshold),
  };
}

export function pulseDayFromLogs(
  logs: Array<{
    start_time: string | Date;
    end_time?: string | Date | null;
    last_alive_at?: string | Date | null;
    deducted_seconds?: number | null;
  }>,
  dateKey: string,
  tz: string,
  idleDaily: Record<string, { idleSeconds?: number; lowActivitySeconds?: number }>,
  hoursThreshold = 7,
): AssistantPulseDay {
  const tracked = trackedHoursFromLogs(logs, dateKey, tz);
  const idleRaw = (idleDaily[dateKey]?.idleSeconds ?? 0) / 3600;
  const lowRaw = (idleDaily[dateKey]?.lowActivitySeconds ?? 0) / 3600;
  const idleHours = tracked.hours > 0 ? Math.min(idleRaw, tracked.hours) : idleRaw;
  const lowHours = tracked.hours > 0 ? Math.min(lowRaw, tracked.hours) : lowRaw;
  const effective = computeEffectiveTime(tracked.hours, lowHours, idleHours);
  return {
    date: dateKey,
    tracked_hours: tracked.hours,
    adjustment_hours: 0,
    hours_worked: tracked.hours,
    low_activity_hours: Math.round(lowHours * 10) / 10,
    idle_hours: Math.round(idleHours * 10) / 10,
    non_effective_hours: effective.non_effective_hours,
    effective_hours: effective.effective_hours,
    below_threshold: tracked.hours < hoursThreshold,
  };
}

export function sumPulseDayHours(
  days: Array<{
    date?: string;
    effective_hours?: number;
    hours_worked?: number;
    non_effective_hours?: number;
  }>,
  keys: string[],
): { effectiveHours: number; hoursWorked: number; nonEffectiveHours: number } {
  const byDate = new Map(
    days.map((row) => [String(row.date || '').slice(0, 10), row] as const),
  );
  let effectiveHours = 0;
  let hoursWorked = 0;
  let nonEffectiveHours = 0;
  for (const key of keys) {
    const row = byDate.get(key);
    if (!row) continue;
    effectiveHours += Number(row.effective_hours) || 0;
    hoursWorked += Number(row.hours_worked) || 0;
    nonEffectiveHours += Number(row.non_effective_hours) || 0;
  }
  return { effectiveHours, hoursWorked, nonEffectiveHours };
}

export function weekMonthPaceFromDays(
  days: Array<{
    date?: string;
    effective_hours?: number;
    hours_worked?: number;
    non_effective_hours?: number;
  }>,
  dateKey: string,
  tz: string,
  todayKey = workDateKey(new Date(), tz),
): { weekPace?: AssistantWeekPace; monthPace?: AssistantMonthPace } {
  const weekStart = mondayKey(dateKey);
  const monthStart = `${dateKey.slice(0, 7)}-01`;
  const monthEnd = lastDayOfMonth(dateKey.slice(0, 7));
  const completedFor = (keys: string[]) =>
    keys.filter((key) => (dateKey < todayKey ? key <= dateKey : key < dateKey));

  const weekdayKeys = weekdayKeysInclusive(weekStart, dateKey);
  const friday = addCalendarDays(weekStart, 4);
  const weekSum = sumPulseDayHours(days, weekdayKeys);
  const weekPace: AssistantWeekPace | undefined = weekdayKeys.length
    ? {
        ...weekSum,
        weekdaysCounted: weekdayKeys.length,
        completedWeekdays: completedFor(weekdayKeys).length,
        remainingWeekdays: weekdayKeysInclusive(addCalendarDays(dateKey, 1), friday).length,
        weeklyTargetHours: WEEKLY_HOURS_TARGET,
      }
    : undefined;

  const monthKeys = weekdayKeysInclusive(monthStart, dateKey);
  const monthSum = sumPulseDayHours(days, monthKeys);
  const monthPace: AssistantMonthPace | undefined = monthKeys.length
    ? {
        ...monthSum,
        weekdaysCounted: monthKeys.length,
        completedWeekdays: completedFor(monthKeys).length,
        remainingWeekdays: weekdayKeysInclusive(addCalendarDays(dateKey, 1), monthEnd).length,
        weekdaysInMonth: weekdayKeysInclusive(monthStart, monthEnd).length,
        monthLabel: monthLabelFromDateKey(dateKey),
      }
    : undefined;
  return { weekPace, monthPace };
}

export function sessionsFromLogs(
  logs: Array<{
    start_time: string | Date;
    end_time?: string | Date | null;
    last_alive_at?: string | Date | null;
    project_name?: string | null;
  }>,
  dateKey: string,
  tz: string,
): AssistantSession[] {
  const { startMs: dayStart, endMs: dayEnd } = workDayBoundsMs(dateKey, tz);
  const sessions: AssistantSession[] = [];
  for (const log of logs) {
    const startMs = new Date(log.start_time).getTime();
    const endMs = sessionEndMs(log);
    if (!Number.isFinite(startMs) || endMs <= startMs) continue;
    const clipStart = Math.max(startMs, dayStart);
    const clipEnd = Math.min(endMs, dayEnd);
    if (clipEnd <= clipStart) continue;
    sessions.push({
      start: formatWorkClock(new Date(clipStart), tz),
      end: formatWorkClock(new Date(clipEnd), tz),
      duration_label: formatDecimalHours((clipEnd - clipStart) / 3_600_000, { emptyLabel: '0 min' }),
      project: log.project_name ? String(log.project_name) : null,
      open: !log.end_time,
    });
  }
  return sessions;
}

export function sampleScreenshotInsights(
  rows: AssistantScreenshotSample[],
  limit = 16,
): AssistantScreenshotSample[] {
  if (rows.length <= limit) return rows;
  const ranked = [...rows].sort((a, b) => samplePriority(b) - samplePriority(a));
  const chosen = new Set<number>();
  const byTime = [...rows].sort((a, b) => String(a.time).localeCompare(String(b.time)));
  for (const row of ranked) {
    if (chosen.size >= Math.min(8, limit)) break;
    const idx = byTime.indexOf(row);
    if (idx >= 0) chosen.add(idx);
  }
  const step = Math.max(1, Math.floor(byTime.length / limit));
  for (let i = 0; i < byTime.length && chosen.size < limit; i += step) chosen.add(i);
  chosen.add(0);
  chosen.add(byTime.length - 1);
  return [...chosen]
    .filter((i) => i >= 0 && i < byTime.length)
    .sort((a, b) => a - b)
    .slice(0, limit)
    .map((i) => byTime[i]);
}

export function buildCanonicalFacts(stats: AssistantStats): string[] {
  const facts = [
    `Audience: the signed-in person only. Speak to them as you/your. Never mention anyone else.`,
    `Work day ${stats.date} in ${stats.timezone}.`,
    `Hours source: ${stats.hours_source === 'pulse_daily_hours' ? 'their official recorded day' : 'their synced timer sessions with official idle/low-activity rules'}.`,
    `Tracked (timer): ${hoursLabel(stats.tracked_hours)}.`,
    `Hours worked (includes leave/adjustments on their day): ${hoursLabel(stats.hours_worked)}.`,
    `Adjustments/leave applied: ${hoursLabel(stats.adjustment_hours)}.`,
    `Effective: ${hoursLabel(stats.effective_hours)}.`,
    `Non-effective: ${hoursLabel(stats.non_effective_hours)} (idle ${hoursLabel(stats.idle_hours)} + low-activity ${hoursLabel(stats.low_activity_hours)}).`,
    `Daily target: ${hoursLabel(stats.hours_threshold)}. Remaining to effective target: ${hoursLabel(Math.max(0, stats.hours_threshold - stats.effective_hours))}.`,
    `Below hours-worked target: ${stats.below_hours_worked_target ? 'yes' : 'no'}. Below effective target: ${stats.below_effective_target ? 'yes' : 'no'}.`,
    `Coaching severity: ${stats.coaching.severity}. Headline: ${stats.coaching.headline}.`,
    `Non-effective share of hours worked: ${stats.coaching.non_effective_share}%. Primary non-effective cause: ${stats.coaching.primary_non_effective_cause}.`,
    `Week-to-date (Mon–this day, weekdays): effective ${hoursLabel(stats.coaching.week_effective_hours)} vs expected ${hoursLabel(stats.coaching.week_expected_hours)} (${stats.coaching.completed_weekdays} completed weekday(s), ${stats.coaching.weekdays_counted} weekday(s) in window, ${hoursLabel(stats.coaching.weekly_target_hours)} week target, ${stats.coaching.remaining_weekdays} weekday(s) left).`,
    `Month-to-date (${stats.coaching.month_label || 'this month'}, 1st–this day, weekdays): effective ${hoursLabel(stats.coaching.month_effective_hours)} vs expected ${hoursLabel(stats.coaching.month_expected_hours)} (${stats.coaching.month_completed_weekdays} completed weekday(s), ${stats.coaching.month_weekdays_counted} weekday(s) in window, ${hoursLabel(stats.coaching.month_target_hours)} month target, ${stats.coaching.month_remaining_weekdays} weekday(s) left).`,
    `Coaching tips: ${stats.coaching.tips.length ? stats.coaching.tips.join(' | ') : 'none'}.`,
    `Sessions: ${stats.session_count}. First start: ${stats.first_start || 'none'}. Last end: ${stats.last_end || 'none'}.`,
  ];
  if (stats.sessions.length) {
    facts.push(
      `Session timeline: ${stats.sessions
        .map(
          (s) =>
            `${s.start}–${s.end} (${s.duration_label}${s.project ? `, ${s.project}` : ''}${s.open ? ', still open' : ''})`,
        )
        .join('; ')}.`,
    );
  }
  if (stats.projects.length) {
    facts.push(
      `Projects: ${stats.projects.map((p) => `${p.name} ${hoursLabel(p.hours)}`).join(', ')}.`,
    );
  } else {
    facts.push('Projects: none synced.');
  }
  const shot = stats.screenshots;
  facts.push(
    `Screenshots: ${shot.total} captured, ${shot.analyzed} analyzed, ${shot.pending} pending, ${shot.failed} failed.`,
  );
  facts.push(
    `Vision mix after meeting rules: ${shot.productive} productive, ${shot.neutral} neutral, ${shot.distraction} distraction, ${shot.meeting} video-meeting.`,
  );
  if (shot.avg_activity_percent != null) {
    facts.push(`Average screenshot activity: ${shot.avg_activity_percent}%.`);
  }
  if (shot.activity_types.length) {
    facts.push(`Activity types: ${shot.activity_types.map((r) => `${r.type} ${r.count}`).join(', ')}.`);
  }
  if (shot.productivity_flags.length) {
    facts.push(`Productivity flags: ${shot.productivity_flags.map((r) => `${r.flag} ${r.count}`).join(', ')}.`);
  }
  if (shot.top_apps.length) {
    facts.push(`Top apps in captures: ${shot.top_apps.map((r) => `${r.name} (${r.count})`).join(', ')}.`);
  }
  if (shot.samples.length) {
    facts.push(
      `Screenshot samples: ${shot.samples
        .map((row) => {
          const bits = [
            row.time,
            row.app_name,
            row.is_meeting ? 'video meeting' : null,
            row.category,
            row.productivity_flag,
            row.activity_percent != null ? `${row.activity_percent}% activity` : null,
            row.description,
          ].filter(Boolean);
          return bits.join(' · ');
        })
        .join(' | ')}.`,
    );
  }
  return facts;
}

export function compactStatsForPrompt(stats: AssistantStats): Record<string, unknown> {
  return {
    date: stats.date,
    timezone: stats.timezone,
    hours_source: stats.hours_source,
    daily_target: hoursLabel(stats.hours_threshold),
    tracked: hoursLabel(stats.tracked_hours),
    hours_worked: hoursLabel(stats.hours_worked),
    adjustments: hoursLabel(stats.adjustment_hours),
    idle: hoursLabel(stats.idle_hours),
    low_activity: hoursLabel(stats.low_activity_hours),
    non_effective: hoursLabel(stats.non_effective_hours),
    effective: hoursLabel(stats.effective_hours),
    remaining_to_effective_target: hoursLabel(
      Math.max(0, stats.hours_threshold - stats.effective_hours),
    ),
    below_hours_worked_target: stats.below_hours_worked_target,
    below_effective_target: stats.below_effective_target,
    coaching: {
      severity: stats.coaching.severity,
      headline: stats.coaching.headline,
      non_effective_share: stats.coaching.non_effective_share,
      primary_non_effective_cause: stats.coaching.primary_non_effective_cause,
      week_effective: hoursLabel(stats.coaching.week_effective_hours),
      week_expected: hoursLabel(stats.coaching.week_expected_hours),
      weekdays_counted: stats.coaching.weekdays_counted,
      completed_weekdays: stats.coaching.completed_weekdays,
      remaining_weekdays: stats.coaching.remaining_weekdays,
      weekly_target: hoursLabel(stats.coaching.weekly_target_hours),
      month_label: stats.coaching.month_label,
      month_effective: hoursLabel(stats.coaching.month_effective_hours),
      month_expected: hoursLabel(stats.coaching.month_expected_hours),
      month_weekdays_counted: stats.coaching.month_weekdays_counted,
      month_completed_weekdays: stats.coaching.month_completed_weekdays,
      month_remaining_weekdays: stats.coaching.month_remaining_weekdays,
      month_target: hoursLabel(stats.coaching.month_target_hours),
      tips: stats.coaching.tips,
    },
    session_count: stats.session_count,
    first_start: stats.first_start,
    last_end: stats.last_end,
    sessions: stats.sessions,
    projects: stats.projects.map((p) => ({ name: p.name, hours: hoursLabel(p.hours) })),
    screenshots: {
      total: stats.screenshots.total,
      analyzed: stats.screenshots.analyzed,
      pending: stats.screenshots.pending,
      failed: stats.screenshots.failed,
      productive: stats.screenshots.productive,
      distraction: stats.screenshots.distraction,
      neutral: stats.screenshots.neutral,
      meeting: stats.screenshots.meeting,
      avg_activity_percent: stats.screenshots.avg_activity_percent,
      activity_types: stats.screenshots.activity_types,
      productivity_flags: stats.screenshots.productivity_flags,
      top_apps: stats.screenshots.top_apps,
      samples: stats.screenshots.samples.map((row) => ({
        time: row.time,
        app: row.app_name,
        window: String(row.window_title || '').slice(0, 80) || null,
        activity_type: row.activity_type,
        category: row.category,
        activity_percent: row.activity_percent,
        productivity_flag: row.productivity_flag,
        is_meeting: row.is_meeting,
        description: String(row.description || '').slice(0, 360) || null,
        feedback: String(row.feedback || '').slice(0, 220) || null,
      })),
    },
  };
}

const RETRIEVAL_STOP_WORDS = new Set([
  'a', 'an', 'the', 'my', 'me', 'i', 'im', 'is', 'are', 'was', 'were', 'what', 'whats',
  'how', 'do', 'did', 'does', 'to', 'of', 'for', 'on', 'in', 'and', 'or', 'you', 'your',
  'today', 'please', 'can', 'could', 'tell', 'about', 'this', 'that', 'with', 'from',
  'it', 'be', 'am', 'at', 'if', 'so', 'just', 'any',
]);

function retrievalTokens(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !RETRIEVAL_STOP_WORDS.has(token));
}

/** Passages the coach can retrieve from the signed-in person's recorded day. */
export function coachPassages(stats: AssistantStats): string[] {
  const shot = stats.screenshots;
  const lines = [
    `Work day ${stats.date} in ${stats.timezone}.`,
    `Tracked timer time: ${hoursLabel(stats.tracked_hours)}.`,
    `Hours worked: ${hoursLabel(stats.hours_worked)}. Adjustments or leave: ${hoursLabel(stats.adjustment_hours)}.`,
    `Effective time: ${hoursLabel(stats.effective_hours)}.`,
    `Non-effective time: ${hoursLabel(stats.non_effective_hours)}. Idle: ${hoursLabel(stats.idle_hours)}. Low-activity: ${hoursLabel(stats.low_activity_hours)}.`,
    `Daily target: ${hoursLabel(stats.hours_threshold)}.`,
    `Week pacing: effective ${hoursLabel(stats.coaching.week_effective_hours)} versus expected ${hoursLabel(stats.coaching.week_expected_hours)}. Week target ${hoursLabel(stats.coaching.weekly_target_hours)}.`,
    `Month pacing (${stats.coaching.month_label || 'this month'}): effective ${hoursLabel(stats.coaching.month_effective_hours)} versus expected ${hoursLabel(stats.coaching.month_expected_hours)}. Month target ${hoursLabel(stats.coaching.month_target_hours)}.`,
    stats.coaching.headline ? `Coaching headline: ${stats.coaching.headline}.` : '',
    ...stats.coaching.tips.map((tip) => `Coaching tip: ${tip}`),
    `Sessions: ${stats.session_count}. First start: ${stats.first_start || 'none'}. Last end: ${stats.last_end || 'none'}.`,
    ...stats.sessions.map(
      (session) =>
        `Session ${session.start}–${session.end} (${session.duration_label}${session.project ? `, project ${session.project}` : ''}${session.open ? ', still open' : ''}).`,
    ),
    ...stats.projects.map((project) => `Project ${project.name}: ${hoursLabel(project.hours)}.`),
    `Screenshots: ${shot.total} captured, ${shot.analyzed} analyzed, ${shot.productive} on-task, ${shot.neutral} mixed, ${shot.distraction} off-task, ${shot.meeting} video-meeting.`,
    ...shot.top_apps.map((app) => `App ${app.name} appeared in ${app.count} screenshots.`),
    ...shot.activity_types.map((row) => `Screenshot activity type ${row.type}: ${row.count}.`),
    ...shot.samples.map((row) => {
      const bits = [
        row.time,
        row.app_name,
        row.window_title,
        row.is_meeting ? 'video meeting' : null,
        row.category,
        row.activity_type,
        row.description,
      ].filter(Boolean);
      return `Screenshot: ${bits.join(' · ')}.`;
    }),
  ];
  return lines.map((line) => String(line || '').trim()).filter(Boolean);
}

/**
 * Keyword retrieval over the recorded day. Unrelated questions (no shared
 * words with the record) return nothing, so the model answers them directly.
 */
export function retrieveCoachPassages(stats: AssistantStats, question: string, limit = 8): string[] {
  const needles = retrievalTokens(question);
  if (!needles.length) return [];
  const ranked = coachPassages(stats)
    .map((text) => {
      const hay = retrievalTokens(text);
      const haySet = new Set(hay);
      let score = 0;
      for (const needle of needles) {
        if (haySet.has(needle)) score += 2;
        else if (hay.some((token) => token.includes(needle) || needle.includes(token))) score += 1;
      }
      return { text, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.text.localeCompare(b.text));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of ranked) {
    if (seen.has(row.text)) continue;
    seen.add(row.text);
    out.push(row.text);
    if (out.length >= limit) break;
  }
  return out;
}

/** Question, conversation, and only the passages that match the question. */
export function buildRagUserContent(
  stats: AssistantStats,
  question: string,
  history?: AssistantChatTurn[],
): string {
  const aboutWork = questionIsAboutRecordedWork(question);
  const retrieved = retrieveCoachPassages(stats, question);
  const grounding = aboutWork
    ? [
        `Effective time: ${hoursLabel(stats.effective_hours)}.`,
        `Tracked timer time: ${hoursLabel(stats.tracked_hours)}.`,
        `Idle: ${hoursLabel(stats.idle_hours)}. Low-activity: ${hoursLabel(stats.low_activity_hours)}. Non-effective: ${hoursLabel(stats.non_effective_hours)}.`,
      ]
    : [];
  const passages = [...new Set([...grounding, ...retrieved])];
  const conversation = formatChatHistory(history);
  return [
    'Answer their latest question. Retrieved passages are the only source for their recorded work. If none of them answer the question, answer it as a normal question and do not invent hours.',
    conversation ? `Recent conversation:\n${conversation}` : '',
    passages.length
      ? `RETRIEVED PASSAGES:\n${passages.map((line) => `- ${line}`).join('\n')}`
      : 'RETRIEVED PASSAGES: none.',
    `Their latest question: ${question}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildPromptUserContent(stats: AssistantStats, instruction: string): string {
  const facts = buildCanonicalFacts(stats)
    .map((line) => `- ${line}`)
    .join('\n');
  return [
    instruction,
    'FACTS (copy hour labels exactly; do not invent):',
    facts,
    'STATS JSON (detail only):',
    JSON.stringify(compactStatsForPrompt(stats)),
  ].join('\n\n');
}

export function parseAssistantCopy(parsed: Record<string, unknown> | null | undefined): AssistantBriefingCopy | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const greeting = asLine(parsed.greeting);
  const summary = asLine(parsed.summary, 1600);
  const effective = asLine(parsed.effective_breakdown, 1200);
  const screenshots = asLine(parsed.screenshot_insights, 1200);
  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions
        .map((item) => asLine(item, 240))
        .filter(Boolean)
        .slice(0, 5)
    : [];
  if (!summary && !effective && !screenshots && suggestions.length === 0) return null;
  return {
    greeting: greeting || 'Here is your month so far.',
    summary: summary || 'I could not summarize your day from the hours on record.',
    effective_breakdown: effective || 'Your effective and non-effective hours are in the cards above.',
    screenshot_insights: screenshots || 'Screenshot analysis of your captures is in the card above.',
    suggestions,
  };
}

export function openingMessage(copy: AssistantBriefingCopy): string {
  return [copy.greeting, copy.summary]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join('\n\n');
}

export function monthLabelFromDateKey(dateKey: string): string {
  const [year, month] = String(dateKey)
    .slice(0, 10)
    .split('-')
    .map((n) => parseInt(n, 10));
  if (!year || !month) return 'this month';
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

export function buildCoaching(
  stats: Omit<AssistantStats, 'coaching'>,
  weekPace?: AssistantWeekPace,
  monthPace?: AssistantMonthPace,
): AssistantCoaching {
  const worked = Math.max(0, Number(stats.hours_worked) || 0);
  const idle = Math.max(0, Number(stats.idle_hours) || 0);
  const low = Math.max(0, Number(stats.low_activity_hours) || 0);
  const nonEff = Math.max(0, Number(stats.non_effective_hours) || 0);
  const effective = Math.max(0, Number(stats.effective_hours) || 0);
  const target = Math.max(0, Number(stats.hours_threshold) || 0);
  const remaining = Math.max(0, target - effective);
  const share = worked > 0 ? Math.round((nonEff / worked) * 100) : 0;
  const highNonEffective = nonEff >= 1 || (worked > 0 && share >= 20);

  let cause: NonEffectiveCause = 'none';
  if (worked <= 0) cause = 'not_tracking';
  else if (nonEff <= 0) cause = 'none';
  else if (idle >= low * 1.2 && idle > 0) cause = 'idle';
  else if (low >= idle * 1.2 && low > 0) cause = 'low_activity';
  else if (nonEff > 0) cause = 'mixed';

  const weekEffective = round1(weekPace?.effectiveHours ?? 0);
  const completedWeekdays = weekPace?.completedWeekdays ?? 0;
  const weekExpected = round1(completedWeekdays * target);
  const weekdaysCounted = weekPace?.weekdaysCounted ?? 0;
  const remainingWeekdays = weekPace?.remainingWeekdays ?? 0;
  const weeklyTarget = round1(weekPace?.weeklyTargetHours ?? 35);
  const behindWeek = weekdaysCounted > 0 && weekEffective + 0.05 < weekExpected;

  const monthEffective = round1(monthPace?.effectiveHours ?? 0);
  const monthCompleted = monthPace?.completedWeekdays ?? 0;
  const monthExpected = round1(monthCompleted * target);
  const monthWeekdaysCounted = monthPace?.weekdaysCounted ?? 0;
  const monthRemaining = monthPace?.remainingWeekdays ?? 0;
  const monthTarget = round1((monthPace?.weekdaysInMonth ?? 0) * target);
  const monthLabel = monthPace?.monthLabel || monthLabelFromDateKey(stats.date);
  const behindMonth = monthWeekdaysCounted > 0 && monthEffective + 0.05 < monthExpected;

  let severity: CoachingSeverity = 'ok';
  if (cause === 'not_tracking' && monthEffective <= 0) {
    severity = 'behind';
  } else if (stats.below_effective_target && (highNonEffective || behindWeek || behindMonth)) {
    severity = 'behind';
  } else if (highNonEffective || stats.below_effective_target || behindWeek || behindMonth) {
    severity = 'watch';
  }

  let headline = 'Your effective time looks on track.';
  if (cause === 'not_tracking' && monthEffective > 0) {
    headline = `No time on this day yet. This month you have ${hoursLabel(monthEffective)} effective.`;
  } else if (cause === 'not_tracking') {
    headline = 'You have not tracked this work day yet.';
  } else if (highNonEffective && cause === 'idle') {
    headline = `A lot of your non-effective time is idle (${hoursLabel(idle)}).`;
  } else if (highNonEffective && cause === 'low_activity') {
    headline = `A lot of your non-effective time is low activity (${hoursLabel(low)}).`;
  } else if (highNonEffective) {
    headline = `Your non-effective time is ${hoursLabel(nonEff)} (${share}% of hours worked).`;
  } else if (stats.below_effective_target) {
    headline = `You are ${hoursLabel(remaining)} short of the ${hoursLabel(target)} effective-day target.`;
  } else if (behindMonth) {
    headline = `You are behind this month’s expected hours so far.`;
  } else if (behindWeek) {
    headline = `You are behind this week’s expected hours so far.`;
  }

  const tips: string[] = [];
  if (cause === 'not_tracking') {
    tips.push('Start the timer when you begin work so today’s hours and screenshots can be recorded.');
  }
  if (highNonEffective && (cause === 'idle' || cause === 'mixed')) {
    tips.push(
      `You have ${hoursLabel(idle)} of idle. Stop the timer or take a break when you step away so that time does not count against your effective hours.`,
    );
  }
  if (highNonEffective && (cause === 'low_activity' || cause === 'mixed')) {
    tips.push(
      `You have ${hoursLabel(low)} of low activity. Keep using the keyboard or mouse on work. Video meetings already count as work, so you do not need extra movement then.`,
    );
  }
  if (stats.below_effective_target && worked > 0) {
    tips.push(
      `Your effective time is ${hoursLabel(effective)} vs a ${hoursLabel(target)} target (${hoursLabel(remaining)} remaining). Keep tracking if you are still working.`,
    );
  }
  if (behindWeek) {
    tips.push(
      `This week you have ${hoursLabel(weekEffective)} effective vs ${hoursLabel(weekExpected)} expected across ${completedWeekdays} completed weekday(s). ${remainingWeekdays} weekday(s) remain toward ${hoursLabel(weeklyTarget)}.`,
    );
  }
  if (behindMonth) {
    tips.push(
      `This month you have ${hoursLabel(monthEffective)} effective vs ${hoursLabel(monthExpected)} expected across ${monthCompleted} completed weekday(s). ${monthRemaining} weekday(s) remain toward ${hoursLabel(monthTarget)}.`,
    );
  }
  if (stats.screenshots.distraction > 0) {
    tips.push(
      `${stats.screenshots.distraction} screenshot${stats.screenshots.distraction === 1 ? '' : 's'} looked off-task. Keep personal tabs off the screen while you are tracking.`,
    );
  }
  if (!tips.length) {
    tips.push('Keep the timer running while you work, and stop it when you finish, so your hours match the day you actually worked.');
  }

  return {
    severity,
    headline,
    non_effective_share: share,
    primary_non_effective_cause: cause,
    week_effective_hours: weekEffective,
    week_expected_hours: weekExpected,
    week_hours_worked: round1(weekPace?.hoursWorked ?? 0),
    weekdays_counted: weekdaysCounted,
    completed_weekdays: completedWeekdays,
    remaining_weekdays: remainingWeekdays,
    weekly_target_hours: weeklyTarget,
    month_label: monthLabel,
    month_effective_hours: monthEffective,
    month_expected_hours: monthExpected,
    month_hours_worked: round1(monthPace?.hoursWorked ?? 0),
    month_weekdays_counted: monthWeekdaysCounted,
    month_completed_weekdays: monthCompleted,
    month_remaining_weekdays: monthRemaining,
    month_target_hours: monthTarget,
    tips: tips.slice(0, 5),
  };
}

export function screenshotSampleLine(
  shot: AssistantStats['screenshots'],
  limit = 3,
): string {
  const notable = [...(shot.samples || [])]
    .sort((a, b) => samplePriority(b) - samplePriority(a))
    .filter((row) => row.description || row.is_meeting || row.category === 'distraction' || row.app_name)
    .slice(0, limit);
  if (!notable.length) return '';
  return ` Notable captures: ${notable
    .map((row) =>
      [row.time, row.app_name, row.is_meeting ? 'video meeting' : row.category, row.description ? String(row.description).slice(0, 140) : null]
        .filter(Boolean)
        .join(' · '),
    )
    .join('; ')}.`;
}

export function fallbackBriefing(stats: AssistantStats): AssistantBriefingCopy {
  const tracked = hoursLabel(stats.tracked_hours);
  const worked = hoursLabel(stats.hours_worked);
  const effective = hoursLabel(stats.effective_hours);
  const idle = hoursLabel(stats.idle_hours);
  const low = hoursLabel(stats.low_activity_hours);
  const nonEff = hoursLabel(stats.non_effective_hours);
  const projectLine =
    stats.projects.length > 0
      ? ` Projects: ${stats.projects.map((p) => `${p.name} (${hoursLabel(p.hours)})`).join(', ')}.`
      : '';
  const sessionLine =
    stats.first_start && stats.last_end
      ? ` First start ${stats.first_start}, last end ${stats.last_end}.`
      : '';

  let screenshotInsights: string;
  const shot = stats.screenshots;
  if (shot.total === 0) {
    screenshotInsights =
      'No screenshots of your screen have synced for this day yet. Analysis shows up after captures upload.';
  } else if (shot.analyzed === 0) {
    screenshotInsights = `You have ${shot.total} screenshot${shot.total === 1 ? '' : 's'}; analysis is still running.`;
  } else {
    const top = shot.top_apps[0]?.name;
    const activity = shot.activity_types[0]?.type;
    screenshotInsights = `I looked at ${shot.analyzed} of your ${shot.total} screenshots: ${shot.productive} on-task, ${shot.neutral} mixed, ${shot.distraction} off-task, ${shot.meeting} video-meeting.${activity ? ` Most common activity: ${activity}.` : ''}${top ? ` Most captures were in ${top}.` : ''}${screenshotSampleLine(shot)}`;
  }

  const suggestions = (stats.coaching?.tips || []).slice(0, 5);
  if (!suggestions.length) {
    suggestions.push(
      'Keep the timer running while you work, and stop it when you finish, so your hours match the day you actually worked.',
    );
  }

  const workedNote =
    stats.adjustment_hours !== 0 && stats.hours_worked !== stats.tracked_hours
      ? ` Your hours worked are ${worked} after ${hoursLabel(stats.adjustment_hours)} of leave or adjustment.`
      : '';

  const weekLine =
    stats.coaching.weekdays_counted > 0
      ? ` This week you have ${hoursLabel(stats.coaching.week_effective_hours)} effective vs ${hoursLabel(stats.coaching.week_expected_hours)} expected so far.`
      : '';
  const monthLine =
    stats.coaching.month_weekdays_counted > 0
      ? `This month (${stats.coaching.month_label}) you have ${hoursLabel(stats.coaching.month_effective_hours)} effective vs ${hoursLabel(stats.coaching.month_expected_hours)} expected so far, toward ${hoursLabel(stats.coaching.month_target_hours)} for the month.`
      : 'I do not have recorded hours for you this month yet.';

  return {
    greeting: stats.coaching.month_hours_worked > 0 || stats.hours_worked > 0
      ? 'Here is your month so far.'
      : 'No recorded hours yet this month.',
    summary:
      stats.hours_worked > 0
        ? `${monthLine} Today you tracked ${tracked} across ${stats.session_count} session${stats.session_count === 1 ? '' : 's'} (${stats.timezone}).${workedNote}${sessionLine}${projectLine} Ask me about idle, screenshots, or how to catch up.`
        : `${monthLine} Nothing has synced for this work day yet. Start tracking to record your hours, idle, and screenshots.`,
    effective_breakdown: `${stats.coaching.headline} Your effective time is ${effective}. Non-effective is ${nonEff} (idle ${idle}, low-activity ${low}). Effective hours are hours worked minus idle and low-activity; video meetings count as work.${weekLine}${
      stats.coaching.month_weekdays_counted > 0
        ? ` This month you have ${hoursLabel(stats.coaching.month_effective_hours)} effective vs ${hoursLabel(stats.coaching.month_expected_hours)} expected.`
        : ''
    }`,
    screenshot_insights: screenshotInsights,
    suggestions: suggestions.slice(0, 5),
  };
}

export type CoachQuestionKind =
  | 'effective_today'
  | 'non_effective_today'
  | 'idle'
  | 'low_activity'
  | 'tracked_today'
  | 'screenshots'
  | 'meetings'
  | 'month'
  | 'week'
  | 'suggestions'
  | 'reduce_non_effective'
  | 'breakdown'
  | 'summarize_day'
  | 'projects'
  | 'sessions'
  | 'unknown';

const HOUR_LABEL_RE = /\d+\s+hours?(?:\s+\d+\s+min)?|\d+\s+min/gi;
const DECIMAL_HOURS_RE = /\d+\.\d+\s*hours?\b/i;
const HOUR_QUESTION_KINDS: CoachQuestionKind[] = [
  'effective_today',
  'non_effective_today',
  'idle',
  'low_activity',
  'tracked_today',
  'month',
  'week',
  'breakdown',
  'summarize_day',
];

export function classifyCoachQuestion(question: string): CoachQuestionKind {
  const q = String(question || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!q) return 'unknown';
  if (/\b(screenshot|screen shot|vision|on[- ]task|off[- ]task|what (was|were) i doing|what did i (do|work)|which apps?|what apps?)\b/.test(q)) {
    return 'screenshots';
  }
  if (/\b(meeting|zoom|teams|google meet|video call)\b/.test(q)) return 'meetings';
  if (/\bmonth so far\b/.test(q) || /\bmonth to date\b/.test(q) || /\bmtd\b/.test(q)) return 'month';
  if (/\bthis month\b/.test(q) && !/\btoday\b/.test(q)) return 'month';
  if (/\bmonth\b/.test(q) && !/\btoday\b/.test(q) && !/\beffective|non-?effective|idle|tracked\b/.test(q)) {
    return 'month';
  }
  if (/\b(week pace|week to date|wtd|this week)\b/.test(q)) return 'week';
  if (/\bweek\b/.test(q) && !/\btoday\b/.test(q)) return 'week';
  if (/\b(on track|behind|pace)\b/.test(q) && /\bmonth\b/.test(q)) return 'month';
  if (/\b(on track|behind|pace)\b/.test(q) && /\bweek\b/.test(q)) return 'week';
  if (/\b(non-?effective|non effective)\b/.test(q) && /\b(reduce|lower|cut|less)\b/.test(q)) {
    return 'reduce_non_effective';
  }
  if (/\b(non-?effective|non effective)\b/.test(q)) return 'non_effective_today';
  if (/\b(low[- ]activity)\b/.test(q)) return 'low_activity';
  if (/\bidle\b/.test(q)) return 'idle';
  if (/\b(breakdown|effective vs)\b/.test(q)) return 'breakdown';
  if (/\beffective\b/.test(q)) return 'effective_today';
  if (/\b(suggest|tip|catch up)\b/.test(q)) return 'suggestions';
  if (
    /\b(what should i|how (do|can) i|how to)\b/.test(q) &&
    /\b(catch up|effective|idle|track|hour|work|focus|non-?effective|screenshot)\b/.test(q)
  ) {
    return 'suggestions';
  }
  if (/\b(on track|behind)\b/.test(q)) return 'suggestions';
  if (/\bsummarize my day\b/.test(q) || /\b(summarize|summary).*(day|today)\b/.test(q)) {
    return 'summarize_day';
  }
  if (/\bproject/.test(q)) return 'projects';
  if (/\bsession/.test(q)) return 'sessions';
  if (/\b(tracked|hours worked|how long|how much)\b/.test(q)) return 'tracked_today';
  return 'unknown';
}

export function looksLikeOpeningDump(summary: string): boolean {
  const text = String(summary || '').toLowerCase();
  return (
    text.includes('this month') &&
    text.includes('today you tracked') &&
    (text.includes('ask me about') || text.includes('toward'))
  );
}

export function extractHourLabels(text: string): string[] {
  const labels = String(text || '').match(HOUR_LABEL_RE) || [];
  return [...new Set(labels.map((label) => label.toLowerCase().replace(/\s+/g, ' ')))];
}

export function keepsHourLabels(canonical: string, rewritten: string): boolean {
  const unique = extractHourLabels(canonical);
  if (!unique.length) return true;
  const hay = String(rewritten || '').toLowerCase().replace(/\s+/g, ' ');
  return unique.every((label) => hay.includes(label));
}

export function allowedHourLabels(stats: AssistantStats): Set<string> {
  return new Set(
    extractHourLabels([...buildCanonicalFacts(stats), JSON.stringify(compactStatsForPrompt(stats))].join(' ')),
  );
}

export function replyHasInventedHours(stats: AssistantStats, reply: string): boolean {
  const allowed = allowedHourLabels(stats);
  if (extractHourLabels(reply).some((label) => !allowed.has(label))) return true;
  return DECIMAL_HOURS_RE.test(reply);
}

export function coachReplyNeedsHourLabels(question: string): boolean {
  return HOUR_QUESTION_KINDS.includes(classifyCoachQuestion(question));
}

function recordedNames(stats: AssistantStats): string[] {
  const names = [
    ...stats.projects.map((row) => row.name),
    ...stats.screenshots.top_apps.map((row) => row.name),
    ...stats.screenshots.samples.map((row) => row.app_name || ''),
    ...stats.sessions.map((row) => row.project || ''),
  ];
  return [...new Set(names.map((name) => String(name || '').trim()).filter((name) => name.length >= 3))].sort(
    (a, b) => b.length - a.length,
  );
}

function mentionedRecordedName(stats: AssistantStats, question: string): string | null {
  const q = String(question || '').toLowerCase();
  for (const name of recordedNames(stats)) {
    if (q.includes(name.toLowerCase())) return name;
  }
  return null;
}

function describeRecordedName(stats: AssistantStats, name: string, effective: string): string {
  const needle = name.toLowerCase();
  const project = stats.projects.find((row) => row.name.toLowerCase() === needle);
  const app = stats.screenshots.top_apps.find((row) => row.name.toLowerCase() === needle);
  const samples = stats.screenshots.samples.filter((row) => String(row.app_name || '').toLowerCase() === needle);
  const sessions = stats.sessions.filter((row) => String(row.project || '').toLowerCase() === needle);
  const bits: string[] = [];
  if (project) bits.push(`${project.name} has ${hoursLabel(project.hours)} on this day`);
  if (app) bits.push(`${app.count} screenshot${app.count === 1 ? '' : 's'} were in ${app.name}`);
  if (sessions.length) {
    bits.push(
      `sessions: ${sessions.map((row) => `${row.start}–${row.end} (${row.duration_label})`).join('; ')}`,
    );
  }
  if (samples.length) {
    bits.push(
      `captures: ${samples
        .slice(0, 3)
        .map((row) => [row.time, row.category, row.description ? String(row.description).slice(0, 120) : null].filter(Boolean).join(' · '))
        .join('; ')}`,
    );
  }
  if (!bits.length) {
    return `I see ${name} in your record, but I do not have more detail for it on this day. Your effective time is ${effective}.`;
  }
  return `For ${name}: ${bits.join('. ')}. Your effective time today is ${effective}.`;
}

const ARITHMETIC_RE =
  /^(?:what(?:'s| is)\s+)?(-?\d+(?:\.\d+)?)\s*([+\-*/x×])\s*(-?\d+(?:\.\d+)?)\s*\??$/i;

/** Direct answer for a plain arithmetic question such as "2+2". */
export function answerArithmetic(question: string): string | null {
  const q = String(question || '').trim();
  const match = q.match(ARITHMETIC_RE);
  if (!match) return null;
  const left = Number(match[1]);
  const op = match[2];
  const right = Number(match[3]);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  let value: number;
  if (op === '+') value = left + right;
  else if (op === '-') value = left - right;
  else if (op === '*' || op === 'x' || op === '×') value = left * right;
  else if (op === '/') {
    if (right === 0) return 'I can’t divide by zero.';
    value = left / right;
  } else {
    return null;
  }
  const shown = Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
  const symbol = op === 'x' || op === '×' ? '×' : op;
  return `${left} ${symbol} ${right} is ${shown}.`;
}

export function questionIsAboutRecordedWork(question: string): boolean {
  if (answerArithmetic(question)) return false;
  if (classifyCoachQuestion(question) !== 'unknown') return true;
  const q = String(question || '').toLowerCase();
  return /\b(help|what can you|who are you|what do you do)\b/.test(q);
}

export function replyPivotsToRecordedTime(summary: string): boolean {
  return /\b(effective time|non-effective|you tracked|hours worked|this month you have|\bidle\b|low-activity)\b/i.test(
    summary,
  );
}

export function answerCoachQuestion(stats: AssistantStats, question: string): string {
  const tracked = hoursLabel(stats.tracked_hours);
  const worked = hoursLabel(stats.hours_worked);
  const effective = hoursLabel(stats.effective_hours);
  const idle = hoursLabel(stats.idle_hours);
  const low = hoursLabel(stats.low_activity_hours);
  const nonEff = hoursLabel(stats.non_effective_hours);
  const weekEffective = hoursLabel(stats.coaching.week_effective_hours);
  const weekExpected = hoursLabel(stats.coaching.week_expected_hours);
  const monthEffective = hoursLabel(stats.coaching.month_effective_hours);
  const monthExpected = hoursLabel(stats.coaching.month_expected_hours);
  const monthTarget = hoursLabel(stats.coaching.month_target_hours);
  const sessions = `${stats.session_count} session${stats.session_count === 1 ? '' : 's'}`;
  const shot = stats.screenshots;
  const arithmetic = answerArithmetic(question);
  if (arithmetic) return arithmetic;
  const named = mentionedRecordedName(stats, question);
  const kind = classifyCoachQuestion(question);
  if (
    named &&
    (kind === 'unknown' || kind === 'screenshots' || kind === 'projects' || kind === 'tracked_today')
  ) {
    return describeRecordedName(stats, named, effective);
  }

  switch (kind) {
    case 'effective_today':
      return `Today your effective time is ${effective}. You tracked ${tracked}; non-effective is ${nonEff} (idle ${idle}, low-activity ${low}).`;
    case 'non_effective_today':
      return `Today your non-effective time is ${nonEff}: idle ${idle} and low-activity ${low}. Effective time is ${effective} of ${worked} worked.`;
    case 'idle':
      return `Today you have ${idle} of idle. That counts in non-effective time (${nonEff}). Stop the timer or take a break when you step away so idle does not cut into effective hours.`;
    case 'low_activity':
      return `Today you have ${low} of low activity. Non-effective is ${nonEff} (idle ${idle}, low-activity ${low}). Video meetings already count as work.`;
    case 'tracked_today':
      return `Today you tracked ${tracked} across ${sessions}${stats.timezone ? ` (${stats.timezone})` : ''}. Hours worked are ${worked}; effective time is ${effective}.`;
    case 'screenshots': {
      if (shot.total === 0) {
        return 'No screenshots of your screen have synced for this day yet.';
      }
      if (shot.analyzed === 0) {
        return `You have ${shot.total} screenshot${shot.total === 1 ? '' : 's'} today; analysis is still running.`;
      }
      const activity = shot.activity_types[0]?.type;
      const top = shot.top_apps[0]?.name;
      return `I looked at ${shot.analyzed} of your ${shot.total} screenshots: ${shot.productive} on-task, ${shot.neutral} mixed, ${shot.distraction} off-task, ${shot.meeting} video-meeting.${activity ? ` Most common activity: ${activity}.` : ''}${top ? ` Most captures were in ${top}.` : ''}${screenshotSampleLine(shot)}`;
    }
    case 'meetings': {
      if (shot.meeting <= 0) {
        return `I do not see video-meeting captures in your record for this day. Today effective time is ${effective}; idle is ${idle} and low-activity is ${low}. Video meetings already count as work.`;
      }
      return `I see ${shot.meeting} video-meeting capture${shot.meeting === 1 ? '' : 's'} today. Those count as work, not low-activity. Today effective time is ${effective}.${screenshotSampleLine(shot, 2)}`;
    }
    case 'month':
      return `This month (${stats.coaching.month_label || 'this month'}) you have ${monthEffective} effective vs ${monthExpected} expected so far, toward ${monthTarget} for the month. Today your effective time is ${effective}.`;
    case 'week':
      return `This week you have ${weekEffective} effective vs ${weekExpected} expected so far (${stats.coaching.completed_weekdays} completed weekday(s), ${hoursLabel(stats.coaching.weekly_target_hours)} week target). Today your effective time is ${effective}.`;
    case 'suggestions':
    case 'reduce_non_effective': {
      const tips = (stats.coaching.tips || []).filter(Boolean);
      const first = tips[0] ? ` ${tips[0]}` : '';
      return `${stats.coaching.headline} Today non-effective is ${nonEff} (idle ${idle}, low-activity ${low}).${first}`;
    }
    case 'breakdown':
      return `Today effective time is ${effective} and non-effective is ${nonEff} (idle ${idle}, low-activity ${low}). Effective hours are hours worked minus idle and low-activity; video meetings count as work.`;
    case 'summarize_day':
      return `Today you tracked ${tracked} across ${sessions}. Effective ${effective}, non-effective ${nonEff} (idle ${idle}, low-activity ${low}).${
        stats.projects.length
          ? ` Projects: ${stats.projects.map((p) => `${p.name} (${hoursLabel(p.hours)})`).join(', ')}.`
          : ''
      }${screenshotSampleLine(shot, 2)}`;
    case 'projects':
      return stats.projects.length
        ? `Today your projects: ${stats.projects.map((p) => `${p.name} (${hoursLabel(p.hours)})`).join(', ')}. Effective time is ${effective}.`
        : `I do not have project hours in your record for this day. Today you tracked ${tracked}.`;
    case 'sessions':
      return stats.sessions.length
        ? `Today you have ${sessions}: ${stats.sessions
            .slice(0, 6)
            .map((row) => `${row.start}–${row.end} (${row.duration_label}${row.project ? `, ${row.project}` : ''})`)
            .join('; ')}. You tracked ${tracked}.`
        : stats.first_start && stats.last_end
          ? `Today you have ${sessions}. First start ${stats.first_start}, last end ${stats.last_end}. You tracked ${tracked}.`
          : `Today you have ${sessions} and tracked ${tracked}.`;
    default:
      return 'I can answer everyday questions, and I can answer from your recorded day: hours, idle, low activity, screenshots, sessions, projects, and week or month pacing.';
  }
}

export function fallbackChatReply(stats: AssistantStats, question: string): AssistantBriefingCopy {
  const opening = fallbackBriefing(stats);
  return {
    ...opening,
    greeting: 'Here is that from your record.',
    summary: answerCoachQuestion(stats, question),
  };
}

export function buildStats(params: {
  date: string;
  timezone: string;
  hoursSource: AssistantHoursSource;
  hoursThreshold: number;
  trackedHours: number;
  adjustmentHours?: number;
  hoursWorked?: number;
  sessionCount: number;
  idleHours: number;
  lowActivityHours: number;
  sessions?: AssistantSession[];
  projects: Array<{ name: string; hours: number }>;
  screenshots: AssistantStats['screenshots'];
  weekPace?: AssistantWeekPace;
  monthPace?: AssistantMonthPace;
}): AssistantStats {
  const tracked = round1(params.trackedHours);
  const adjustment = round1(params.adjustmentHours ?? 0);
  const hoursWorked = round1(params.hoursWorked ?? tracked);
  const idle = hoursWorked > 0 ? Math.min(round1(params.idleHours), hoursWorked) : round1(params.idleHours);
  const low = hoursWorked > 0 ? Math.min(round1(params.lowActivityHours), hoursWorked) : round1(params.lowActivityHours);
  const effective = computeEffectiveTime(hoursWorked, low, idle);
  const sessions = params.sessions ?? [];
  const base = {
    date: params.date,
    timezone: params.timezone,
    hours_source: params.hoursSource,
    hours_threshold: params.hoursThreshold,
    tracked_hours: tracked,
    adjustment_hours: adjustment,
    hours_worked: hoursWorked,
    idle_hours: idle,
    low_activity_hours: low,
    non_effective_hours: effective.non_effective_hours,
    effective_hours: effective.effective_hours,
    below_hours_worked_target: hoursWorked < params.hoursThreshold,
    below_effective_target: effective.effective_hours < params.hoursThreshold,
    session_count: params.sessionCount,
    first_start: sessions[0]?.start ?? null,
    last_end: sessions[sessions.length - 1]?.end ?? null,
    sessions,
    projects: params.projects,
    screenshots: params.screenshots,
  };
  return {
    ...base,
    coaching: buildCoaching(base, params.weekPace, params.monthPace),
  };
}

export function emptyScreenshotStats(): AssistantStats['screenshots'] {
  return {
    total: 0,
    analyzed: 0,
    pending: 0,
    failed: 0,
    productive: 0,
    distraction: 0,
    neutral: 0,
    meeting: 0,
    avg_activity_percent: null,
    activity_types: [],
    productivity_flags: [],
    top_apps: [],
    samples: [],
  };
}

export function countBy(values: Array<string | null | undefined>): Array<{ key: string; count: number }> {
  const map = new Map<string, number>();
  for (const raw of values) {
    const key = String(raw || '').trim();
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function hoursLabel(hours: number): string {
  return formatDecimalHours(hours, { emptyLabel: '0 min' });
}

function samplePriority(row: AssistantScreenshotSample): number {
  let score = 0;
  if (row.category === 'distraction' || row.productivity_flag === 'off_task') score += 8;
  if (row.productivity_flag === 'mixed') score += 4;
  if (row.is_meeting) score += 3;
  if (row.category === 'productive' || row.productivity_flag === 'on_task') score += 1;
  if (row.description) score += 1;
  return score;
}

function asLine(value: unknown, max = 280): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function round1(n: number): number {
  return Math.round(Math.max(0, Number(n) || 0) * 10) / 10;
}
