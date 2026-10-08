import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  ScopedAuthUser,
  parseTenantUserId,
  parseWorkspaceId,
} from '../database/time-doctor-sql';
import { workDateKey, workDateRangeToUtcIso } from '../lib/work-timezone';
import { LlmChatClient } from '../screenshot-ai/llm-chat.client';
import {
  applyMeetingScreenshotPresentation,
  hasVideoMeetingEvidence,
} from './meeting-context';
import {
  ASSISTANT_CHAT_SYSTEM_PROMPT,
  ASSISTANT_SYSTEM_PROMPT,
  AssistantBriefingCopy,
  AssistantChatTurn,
  AssistantScreenshotSample,
  AssistantStats,
  AssistantMonthPace,
  AssistantWeekPace,
  AssistantPulseDay,
  AssistantHoursSource,
  buildPromptUserContent,
  buildRagUserContent,
  buildStats,
  countBy,
  emptyScreenshotStats,
  fallbackBriefing,
  answerArithmetic,
  fallbackChatReply,
  questionIsAboutRecordedWork,
  replyPivotsToRecordedTime,
  formatWorkClock,
  coachReplyNeedsHourLabels,
  extractHourLabels,
  looksLikeOpeningDump,
  normalizePulseDay,
  replyHasInventedHours,
  openingMessage,
  parseAssistantCopy,
  pulseDayFromLogs,
  sampleScreenshotInsights,
  sameEmployeeId,
  sessionsFromLogs,
  trackedHoursFromLogs,
  weekMonthPaceFromDays,
} from './assistant-briefing';
import { EffectiveTimeService } from './effective-time.service';
import { PulseService } from './pulse.service';
import { mondayKey } from './pacing-math';

type ScreenshotInsightRow = {
  captured_at: string;
  app_name: string | null;
  window_title: string | null;
  activity_type: string | null;
  category: string | null;
  activity_percent: number | null;
  productivity_flag: string | null;
  description: string | null;
  feedback: string | null;
  is_work_related: boolean | null;
  vision_summary: string | null;
  ocr_excerpt: string | null;
};

type PulseDayRow = AssistantPulseDay;

const OPENING_CACHE_TTL_MS = 15 * 60_000;

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private readonly openingCache = new Map<
    string,
    { at: number; hoursKey: string; copy: AssistantBriefingCopy }
  >();

  constructor(
    private readonly db: DatabaseService,
    private readonly pulse: PulseService,
    private readonly effectiveTime: EffectiveTimeService,
    private readonly deepseek: LlmChatClient,
  ) {}

  async briefing(user: ScopedAuthUser, date?: string) {
    const self = await this.callerContext(user);
    const stats = await this.loadStats(self, date);
    const copy = await this.openingCopy(self, stats);
    return this.payload(stats, copy);
  }

  private openingCacheKey(user: ScopedAuthUser, dateKey: string) {
    return `${String(user.id || '')}:${String(user.organization_id || '')}:${dateKey}`;
  }

  private hoursFingerprint(stats: AssistantStats) {
    const bucket = (hours: number) => Math.round((Number(hours) || 0) * 30);
    return [
      bucket(stats.hours_worked ?? stats.tracked_hours),
      bucket(stats.effective_hours),
      bucket(stats.coaching?.month_effective_hours),
      bucket(stats.coaching?.week_effective_hours),
    ].join('|');
  }

  private async openingCopy(user: ScopedAuthUser, stats: AssistantStats) {
    const key = this.openingCacheKey(user, stats.date);
    const hoursKey = this.hoursFingerprint(stats);
    const cached = this.openingCache.get(key);
    if (cached && cached.hoursKey === hoursKey && Date.now() - cached.at < OPENING_CACHE_TTL_MS) {
      return cached.copy;
    }
    const copy = await this.composeCopy(stats, {
      mode: 'opening',
      instruction: [
        'This is their first chat message.',
        'Open with a month-to-date summary of their recorded hours (effective vs expected vs month target), using exact FACTS hour labels.',
        'Then give a short snapshot of the selected day.',
        'Invite them to ask follow-up questions.',
        'Put that opening in "summary". Greeting is one friendly line to them.',
        'Speak to them as you. Visible text must not mention other people or internal report names.',
        'Be specific: name apps, session times, and screenshot samples from FACTS when they help. Do not sound like a generic template.',
      ].join(' '),
    });
    this.openingCache.set(key, { at: Date.now(), hoursKey, copy });
    return copy;
  }

  async chat(
    user: ScopedAuthUser,
    opts: { date?: string; message: string; history?: AssistantChatTurn[] },
  ) {
    const self = await this.callerContext(user);
    const stats = await this.loadStats(self, opts.date);
    const question = String(opts.message || '').trim().slice(0, 500);
    const copy = await this.composeCopy(stats, {
      mode: 'chat',
      question,
      history: opts.history,
    });
    return {
      ...this.payload(stats, copy),
      reply: copy.summary,
    };
  }

  /**
   * Coach is the signed-in person's own hours. Super-admins lose organization_id
   * in AuthGuard unless Pulse sends X-Pulse-Workspace-Id; restore their home
   * workspace so the desktop app does not require the company picker.
   */
  private async callerContext(user: ScopedAuthUser): Promise<ScopedAuthUser> {
    if (parseWorkspaceId(user.organization_id)) return user;
    try {
      const uid = parseTenantUserId(String(user.id || ''));
      const result = await this.db.query<{ organization_id: string | null }>(
        `SELECT ext.workspace_id::text AS organization_id
         FROM time_doctor.user_extensions ext
         WHERE ext.user_id = $1
         LIMIT 1`,
        [uid],
      );
      const organization_id = result.rows[0]?.organization_id;
      return organization_id ? { ...user, organization_id } : user;
    } catch (err) {
      this.logger.warn(`assistant home workspace skipped: ${String((err as Error)?.message || err)}`);
      return user;
    }
  }

  private payload(stats: AssistantStats, copy: AssistantBriefingCopy) {
    return {
      persona: {
        name: 'Tavilo',
        title: 'Work coach',
      },
      date: stats.date,
      timezone: stats.timezone,
      stats,
      briefing: copy,
      opening: openingMessage(copy),
    };
  }

  private async loadStats(user: ScopedAuthUser, date?: string): Promise<AssistantStats> {
    const settings = await this.pulse.getOrgSettings(user);
    const tz = settings.timezone;
    const dateKey = date || workDateKey(new Date(), tz);
    const userId = String(parseTenantUserId(String(user.id)));
    const workspaceId = parseWorkspaceId(user.organization_id);
    const { startIso, endExclusiveIso } = workDateRangeToUtcIso(dateKey, dateKey, tz);
    const lowActivityThreshold = Math.min(Math.max(Number(settings.low_activity_threshold) || 10, 0), 10);

    const [pulseWindow, logs, projects, screenshots] = await Promise.all([
      this.loadPulseWindow(user, dateKey, userId, tz, {
        workspaceId,
        hoursThreshold: settings.hours_threshold,
        lowActivityThreshold,
        intervalMinutes: settings.screenshot_interval_minutes,
      }),
      this.loadTimeLogs(userId, startIso, endExclusiveIso),
      this.loadProjectHours(user, dateKey, userId),
      this.loadScreenshots(userId, startIso, endExclusiveIso, tz),
    ]);

    const sessions = sessionsFromLogs(logs, dateKey, tz);
    const tracked = trackedHoursFromLogs(logs, dateKey, tz);
    const pulseDay = pulseWindow.day;

    if (pulseDay) {
      return buildStats({
        date: dateKey,
        timezone: tz,
        hoursSource: pulseWindow.hoursSource,
        hoursThreshold: settings.hours_threshold,
        trackedHours: pulseDay.tracked_hours,
        adjustmentHours: pulseDay.adjustment_hours,
        hoursWorked: pulseDay.hours_worked,
        sessionCount: sessions.length || tracked.sessionCount,
        idleHours: pulseDay.idle_hours,
        lowActivityHours: pulseDay.low_activity_hours,
        sessions,
        projects,
        screenshots,
        weekPace: pulseWindow.weekPace,
        monthPace: pulseWindow.monthPace,
      });
    }

    const idleStats = workspaceId
      ? await this.effectiveTime.idleAndLowActivitySecondsForUser({
          userId,
          workspaceId,
          startIso,
          endIso: endExclusiveIso,
          lowActivityThreshold,
          intervalMinutes: settings.screenshot_interval_minutes,
          tz,
        })
      : { idleSeconds: 0, lowActivitySeconds: 0, daily: {} as Record<string, { idleSeconds: number; lowActivitySeconds: number }> };
    const dayIdle = idleStats.daily?.[dateKey];
    const idleHours = (dayIdle?.idleSeconds ?? 0) / 3600;
    const lowHours = (dayIdle?.lowActivitySeconds ?? 0) / 3600;

    return buildStats({
      date: dateKey,
      timezone: tz,
      hoursSource: 'synced_sessions',
      hoursThreshold: settings.hours_threshold,
      trackedHours: tracked.hours,
      sessionCount: sessions.length || tracked.sessionCount,
      idleHours,
      lowActivityHours: lowHours,
      sessions,
      projects,
      screenshots,
      weekPace: pulseWindow.weekPace,
      monthPace: pulseWindow.monthPace,
    });
  }

  private async loadPulseWindow(
    user: ScopedAuthUser,
    dateKey: string,
    userId: string,
    tz: string,
    opts: {
      workspaceId: number | null;
      hoursThreshold: number;
      lowActivityThreshold: number;
      intervalMinutes: number;
    },
  ): Promise<{
    day: PulseDayRow | null;
    weekPace?: AssistantWeekPace;
    monthPace?: AssistantMonthPace;
    hoursSource: AssistantHoursSource;
  }> {
    const weekStart = mondayKey(dateKey);
    const monthStart = `${dateKey.slice(0, 7)}-01`;
    const rangeStart = weekStart < monthStart ? weekStart : monthStart;
    try {
      const result = await this.pulse.getDailyHours(user, rangeStart, dateKey, userId);
      const employee = (result.employees || []).find((row: { employee_id?: string }) =>
        sameEmployeeId(row.employee_id, userId),
      );
      const days = (employee?.days || [])
        .map((row: { date?: string }) => normalizePulseDay(row))
        .filter((row: AssistantPulseDay) => row.date);
      if (days.length) {
        const day = days.find((row: AssistantPulseDay) => row.date === dateKey) ?? null;
        return { day, hoursSource: 'pulse_daily_hours', ...weekMonthPaceFromDays(days, dateKey, tz) };
      }
      this.logger.warn(`assistant pulse roster missed user ${userId}; using synced sessions for week/month`);
    } catch (err) {
      this.logger.warn(`assistant pulse day skipped: ${String((err as Error)?.message || err)}`);
    }
    return this.loadPaceFromSyncedSessions(userId, dateKey, rangeStart, tz, opts);
  }

  private async loadPaceFromSyncedSessions(
    userId: string,
    dateKey: string,
    rangeStart: string,
    tz: string,
    opts: {
      workspaceId: number | null;
      hoursThreshold: number;
      lowActivityThreshold: number;
      intervalMinutes: number;
    },
  ): Promise<{
    day: PulseDayRow | null;
    weekPace?: AssistantWeekPace;
    monthPace?: AssistantMonthPace;
    hoursSource: AssistantHoursSource;
  }> {
    const { startIso, endExclusiveIso } = workDateRangeToUtcIso(rangeStart, dateKey, tz);
    const [logs, idleStats] = await Promise.all([
      this.loadTimeLogs(userId, startIso, endExclusiveIso),
      opts.workspaceId
        ? this.effectiveTime.idleAndLowActivitySecondsForUser({
            userId,
            workspaceId: opts.workspaceId,
            startIso,
            endIso: endExclusiveIso,
            lowActivityThreshold: opts.lowActivityThreshold,
            intervalMinutes: opts.intervalMinutes,
            tz,
          })
        : Promise.resolve({
            idleSeconds: 0,
            lowActivitySeconds: 0,
            daily: {} as Record<string, { idleSeconds: number; lowActivitySeconds: number }>,
          }),
    ]);
    const keys = new Set<string>([dateKey]);
    for (const log of logs) {
      keys.add(workDateKey(log.start_time, tz));
      keys.add(workDateKey(log.end_time || log.last_alive_at || log.start_time, tz));
    }
    const days = [...keys]
      .filter((key) => key >= rangeStart && key <= dateKey)
      .map((key) => pulseDayFromLogs(logs, key, tz, idleStats.daily || {}, opts.hoursThreshold));
    const day = days.find((row) => row.date === dateKey) ?? null;
    return { day, hoursSource: 'synced_sessions', ...weekMonthPaceFromDays(days, dateKey, tz) };
  }

  private async loadTimeLogs(
    userId: string,
    startIso: string,
    endExclusiveIso: string,
  ): Promise<
    Array<{
      start_time: string;
      end_time: string | null;
      last_alive_at: string | null;
      deducted_seconds: number | null;
      project_name: string | null;
    }>
  > {
    const result = await this.db.query<{
      start_time: string;
      end_time: string | null;
      last_alive_at: string | null;
      deducted_seconds: number | null;
      project_name: string | null;
    }>(
      `SELECT t.start_time, t.end_time, t.last_alive_at, t.deducted_seconds,
              NULLIF(TRIM(p.name), '') AS project_name
       FROM time_doctor.time_logs t
       LEFT JOIN time_doctor.projects p ON p.id = t.project_id
       WHERE t.user_id = $1
         AND t.start_time < $3::timestamptz
         AND COALESCE(t.end_time, t.last_alive_at, NOW()) > $2::timestamptz
         AND t.start_time >= ($2::timestamptz - INTERVAL '3 days')
       ORDER BY t.start_time`,
      [userId, startIso, endExclusiveIso],
    );
    return result.rows;
  }

  private async loadProjectHours(
    user: ScopedAuthUser,
    dateKey: string,
    userId: string,
  ): Promise<Array<{ name: string; hours: number }>> {
    try {
      const result = await this.pulse.getProjectHours(user, dateKey, dateKey, userId);
      return (result.projects || [])
        .map((row: { name?: string; hours?: number }) => ({
          name: String(row.name || 'No project'),
          hours: Number(row.hours) || 0,
        }))
        .filter((row: { hours: number }) => row.hours > 0)
        .slice(0, 8);
    } catch (err) {
      this.logger.warn(`assistant project hours skipped: ${String((err as Error)?.message || err)}`);
      return [];
    }
  }

  private async loadScreenshots(
    userId: string,
    startIso: string,
    endExclusiveIso: string,
    tz: string,
  ): Promise<AssistantStats['screenshots']> {
    const [counts, apps, analyzed] = await Promise.all([
      this.db.query<{
        total: string;
        analyzed: string;
        pending: string;
        failed: string;
        avg_activity: string | null;
      }>(
        `SELECT
           COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE s.ai_analysis_status = 'completed')::text AS analyzed,
           COUNT(*) FILTER (WHERE s.ai_analysis_status IN ('pending', 'queued', 'processing'))::text AS pending,
           COUNT(*) FILTER (WHERE s.ai_analysis_status = 'failed')::text AS failed,
           ROUND(AVG(s.activity_percent) FILTER (WHERE s.activity_percent IS NOT NULL))::text AS avg_activity
         FROM time_doctor.screenshots s
         WHERE s.user_id = $1
           AND s.captured_at >= $2::timestamptz
           AND s.captured_at < $3::timestamptz`,
        [userId, startIso, endExclusiveIso],
      ),
      this.db.query<{ name: string; count: string }>(
        `SELECT COALESCE(NULLIF(TRIM(s.app_name), ''), 'Unknown') AS name, COUNT(*)::text AS count
         FROM time_doctor.screenshots s
         WHERE s.user_id = $1
           AND s.captured_at >= $2::timestamptz
           AND s.captured_at < $3::timestamptz
         GROUP BY 1
         ORDER BY COUNT(*) DESC, name ASC
         LIMIT 6`,
        [userId, startIso, endExclusiveIso],
      ),
      this.db.query<ScreenshotInsightRow>(
        `SELECT
           s.captured_at::text AS captured_at,
           s.app_name,
           s.window_title,
           s.activity_type,
           s.category,
           s.activity_percent,
           s.is_work_related,
           COALESCE(s.vision_analysis #>> '{parsed,productivity_flag}', s.vision_analysis->>'productivity_flag') AS productivity_flag,
           s.vision_summary AS description,
           s.vision_summary,
           LEFT(COALESCE(s.vision_analysis #>> '{image_context,ocr_excerpt}', ''), 400) AS ocr_excerpt,
           LEFT(COALESCE(s.vision_analysis #>> '{parsed,feedback_for_employee}', s.vision_analysis->>'feedback_for_employee'), 220) AS feedback
         FROM time_doctor.screenshots s
         WHERE s.user_id = $1
           AND s.captured_at >= $2::timestamptz
           AND s.captured_at < $3::timestamptz
           AND s.ai_analysis_status = 'completed'
         ORDER BY s.captured_at ASC
         LIMIT 200`,
        [userId, startIso, endExclusiveIso],
      ),
    ]);

    const row = counts.rows[0];
    if (!row) return emptyScreenshotStats();

    const presented = analyzed.rows.map((shot) => {
      const meetingRow = applyMeetingScreenshotPresentation({
        app_name: shot.app_name,
        window_title: shot.window_title,
        vision_summary: shot.vision_summary || shot.description,
        ocr_excerpt: shot.ocr_excerpt,
        activity_percent: shot.activity_percent,
        category: shot.category,
        activity_type: shot.activity_type,
        is_work_related: shot.is_work_related,
        productivity_flag: shot.productivity_flag,
      });
      const isMeeting = hasVideoMeetingEvidence(
        shot.app_name,
        shot.window_title,
        `${shot.ocr_excerpt || ''}\n${shot.vision_summary || shot.description || ''}`,
      );
      const sample: AssistantScreenshotSample = {
        time: formatWorkClock(shot.captured_at, tz),
        app_name: shot.app_name,
        window_title: shot.window_title,
        activity_type: meetingRow.activity_type,
        category: meetingRow.category,
        activity_percent:
          meetingRow.activity_percent == null ? null : Number(meetingRow.activity_percent),
        productivity_flag: meetingRow.productivity_flag ?? shot.productivity_flag,
        is_meeting: isMeeting,
        description: shot.description,
        feedback: shot.feedback,
      };
      return sample;
    });

    const activityTypes = countBy(presented.map((s) => s.activity_type)).map((r) => ({
      type: r.key,
      count: r.count,
    }));
    const flags = countBy(presented.map((s) => s.productivity_flag)).map((r) => ({
      flag: r.key,
      count: r.count,
    }));

    return {
      total: parseInt(row.total, 10) || 0,
      analyzed: parseInt(row.analyzed, 10) || 0,
      pending: parseInt(row.pending, 10) || 0,
      failed: parseInt(row.failed, 10) || 0,
      productive: presented.filter((s) => s.category === 'productive').length,
      distraction: presented.filter((s) => s.category === 'distraction').length,
      neutral: presented.filter((s) => s.category === 'neutral').length,
      meeting: presented.filter((s) => s.is_meeting).length,
      avg_activity_percent: row.avg_activity == null ? null : Number(row.avg_activity),
      activity_types: activityTypes,
      productivity_flags: flags,
      top_apps: apps.rows.map((app) => ({ name: app.name, count: parseInt(app.count, 10) || 0 })),
      samples: sampleScreenshotInsights(presented),
    };
  }

  private async composeCopy(
    stats: AssistantStats,
    opts: {
      mode: 'opening' | 'chat';
      instruction?: string;
      question?: string;
      history?: AssistantChatTurn[];
    },
  ): Promise<AssistantBriefingCopy> {
    const question = opts.question || '';
    const direct = opts.mode === 'chat' ? answerArithmetic(question) : null;
    const aboutWork = opts.mode !== 'chat' || questionIsAboutRecordedWork(question);
    const fallback =
      opts.mode === 'chat'
        ? fallbackChatReply(stats, question)
        : fallbackBriefing(stats);
    if (direct) {
      return { ...fallback, greeting: 'Here you go.', summary: direct };
    }
    if (!this.deepseek.isConfigured()) return fallback;
    const instruction = String(opts.instruction || '');
    const systemPrompt = opts.mode === 'chat' ? ASSISTANT_CHAT_SYSTEM_PROMPT : ASSISTANT_SYSTEM_PROMPT;
    const userContent =
      opts.mode === 'chat'
        ? buildRagUserContent(stats, question, opts.history)
        : buildPromptUserContent(stats, instruction);
    try {
      const { parsed } = await this.deepseek.chatJson({
        systemPrompt,
        userContent,
        maxTokens: opts.mode === 'chat' ? 800 : 900,
        temperature: opts.mode === 'chat' ? 0.4 : 0.2,
      });
      const copy = parseAssistantCopy(parsed);
      if (!copy) return fallback;
      if (opts.mode === 'chat') {
        if (!aboutWork && replyPivotsToRecordedTime(copy.summary)) {
          return {
            ...fallback,
            greeting: 'Here you go.',
            summary: 'Ask that again as a normal question. I will answer it directly, without your time record.',
          };
        }
        if (aboutWork && (looksLikeOpeningDump(copy.summary) || replyHasInventedHours(stats, copy.summary))) {
          return fallback;
        }
        if (
          aboutWork &&
          coachReplyNeedsHourLabels(question) &&
          extractHourLabels(copy.summary).length === 0
        ) {
          return fallback;
        }
        return { ...fallback, greeting: copy.greeting || fallback.greeting, summary: copy.summary };
      }
      return copy;
    } catch (err) {
      this.logger.warn(`assistant LLM fallback: ${String((err as Error)?.message || err)}`);
      return fallback;
    }
  }
}
