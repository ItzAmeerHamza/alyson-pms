/**
 * Approved Weekly Hours Pacing HTML email (employee + manager).
 * Source design: time doctor email.html
 */

import { computeEffectiveTime } from '../lib/effective-time';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Decimal hours → "3 h 40 mins" (also handles negatives for pace delta). */
function hoursLabel(n: number): string {
  const raw = Number(n);
  if (!Number.isFinite(raw)) return '0 mins';
  const sign = raw < 0 ? '-' : '';
  const totalMinutes = Math.round(Math.abs(raw) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${sign}${m} mins`;
  if (m === 0) return `${sign}${h} h`;
  return `${sign}${h} h ${m} mins`;
}

function dayName(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return dt.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

function shortDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** "2026-07" → "July" */
function monthNameFromKey(monthKey: string): string {
  const m = String(monthKey || '').trim();
  if (/^\d{4}-\d{2}$/.test(m)) {
    const [y, mo] = m.split('-').map((n) => parseInt(n, 10));
    return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-US', {
      month: 'long',
      timeZone: 'UTC',
    });
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(m)) {
    return monthNameFromKey(m.slice(0, 7));
  }
  return 'this month';
}

const PACE_WEEKLY_HOURS = 35;
/** Per-day tracked pace used in weekly MTD day rows (legacy 7h/day week math). */
const PACE_DAILY_HOURS = 7;
/** Salary eligibility: minimum effective hours per work day. */
export const DAILY_EFFECTIVE_TARGET_HOURS = 7;

function signerFromAddress(fromEmail: string): string {
  const addr = String(fromEmail || '').toLowerCase();
  if (addr.includes('mohita')) return 'Mohita Yadav';
  if (addr.includes('hamza')) return 'Hamza';
  return 'Alyson Pulse';
}

export type DayBreakdownRow = {
  date: string;
  trackedHours: number;
  nonEffectiveHours: number;
  effectiveHours: number;
  dailyTarget: number;
  status: 'Behind' | 'On track' | 'Pending';
};

export type ApprovedPaceEmailInput = {
  employeeName: string | null | undefined;
  department?: string | null;
  hoursWorked: number;
  /** Tracked-hours target (daily ~8h, or MTD week pace). */
  expectedHours: number;
  nonEffectiveHours: number;
  effectiveHours: number;
  /** Remaining to meet the goal used for pace/salary (effective for day emails). */
  hoursRemaining: number;
  avgDailyPace: number;
  /** @deprecated Kept optional for callers; no longer shown in the email. */
  projectedHours?: number;
  paceDelta: number; // vs target (negative = behind)
  periodStart: string;
  periodEnd: string;
  weekIndex: number;
  month: string;
  dayRows: DayBreakdownRow[];
  fromEmail: string;
  /** When true, copy addresses the manager about a team member. */
  forManager?: boolean;
  /**
   * Same email layout; subject + period label differ:
   * - day: one work day
   * - week: one Mon–Fri week (e.g. under 40h)
   * - pace: month-to-date through week N (35/70/105…)
   */
  variant?: 'pace' | 'day' | 'week';
  /** Daily effective hours target for salary (default 7). */
  effectiveHoursTarget?: number;
};

function greetingName(input: ApprovedPaceEmailInput): string {
  const name = String(input.employeeName || 'there').trim() || 'there';
  const dept = String(input.department || '').trim();
  return dept ? `${name} – ${dept}` : name;
}

function buildDayRowsHtml(rows: DayBreakdownRow[], multiWeek: boolean): string {
  const body = rows
    .map((row, idx) => {
      const bg = idx % 2 === 0 ? '#ffffff' : '#f9fafb';
      const dayLabel = multiWeek
        ? `${dayName(row.date)}, ${shortDate(row.date)}`
        : dayName(row.date);
      const statusColor =
        row.status === 'Behind' ? '#dc2626' : row.status === 'On track' ? '#15803d' : '#6b7280';
      const nonEffColor = row.nonEffectiveHours > 0 ? '#dc2626' : '#6b7280';
      return `
                  <tr style="background-color:${bg};">
                    <td style="padding:12px 10px; border-bottom:1px solid #e5e7eb; font-size:13px;">
                      ${escapeHtml(dayLabel)}
                    </td>
                    <td align="right" style="padding:12px 10px; border-bottom:1px solid #e5e7eb;
                                             font-size:13px; font-weight:700;">
                      ${escapeHtml(hoursLabel(row.trackedHours))}
                    </td>
                    <td align="right" style="padding:12px 10px; border-bottom:1px solid #e5e7eb;
                                             font-size:13px; color:${nonEffColor};">
                      ${escapeHtml(hoursLabel(row.nonEffectiveHours))}
                    </td>
                    <td align="right" style="padding:12px 10px; border-bottom:1px solid #e5e7eb;
                                             font-size:13px; font-weight:700;">
                      ${escapeHtml(hoursLabel(row.effectiveHours))}
                    </td>
                    <td align="right" style="padding:12px 10px; border-bottom:1px solid #e5e7eb;
                                             font-size:13px;">
                      ${escapeHtml(hoursLabel(row.dailyTarget))}
                    </td>
                    <td align="center" style="padding:12px 10px; border-bottom:1px solid #e5e7eb;
                                              font-size:12px; color:${statusColor}; font-weight:700;">
                      ${escapeHtml(row.status)}
                    </td>
                  </tr>`;
    })
    .join('');

  const totalTracked = rows.reduce((s, r) => s + r.trackedHours, 0);
  const totalNonEff = rows.reduce((s, r) => s + r.nonEffectiveHours, 0);
  const totalEffective = rows.reduce((s, r) => s + r.effectiveHours, 0);
  const totalTarget = rows.reduce((s, r) => s + r.dailyTarget, 0);
  // Eff. Target column — behind when effective time is short.
  const behind = totalEffective + 0.05 < totalTarget;

  return `
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                       style="width:100%; min-width:580px; border-collapse:collapse;
                              border:1px solid #e5e7eb;">

                  <tr style="background-color:#173b67;">
                    <th align="left" style="padding:12px 10px; color:#ffffff; font-size:12px;
                                            line-height:18px; font-weight:700;">Day</th>
                    <th align="right" style="padding:12px 10px; color:#ffffff; font-size:12px;
                                             line-height:18px; font-weight:700;">Total Tracked</th>
                    <th align="right" style="padding:12px 10px; color:#ffffff; font-size:12px;
                                             line-height:18px; font-weight:700;">Non-effective</th>
                    <th align="right" style="padding:12px 10px; color:#ffffff; font-size:12px;
                                             line-height:18px; font-weight:700;">Effective</th>
                    <th align="right" style="padding:12px 10px; color:#ffffff; font-size:12px;
                                             line-height:18px; font-weight:700;">Eff. Target</th>
                    <th align="center" style="padding:12px 10px; color:#ffffff; font-size:12px;
                                              line-height:18px; font-weight:700;">Status</th>
                  </tr>
                  ${body}
                  <tr style="background-color:#eff6ff;">
                    <td style="padding:13px 10px; font-size:13px; color:#1e3a8a; font-weight:700;">
                      Period Total
                    </td>
                    <td align="right" style="padding:13px 10px; font-size:13px;
                                             color:#1e3a8a; font-weight:700;">
                      ${escapeHtml(hoursLabel(totalTracked))}
                    </td>
                    <td align="right" style="padding:13px 10px; font-size:13px;
                                             color:#dc2626; font-weight:700;">
                      ${escapeHtml(hoursLabel(totalNonEff))}
                    </td>
                    <td align="right" style="padding:13px 10px; font-size:13px;
                                             color:#15803d; font-weight:700;">
                      ${escapeHtml(hoursLabel(totalEffective))}
                    </td>
                    <td align="right" style="padding:13px 10px; font-size:13px;
                                             color:#1e3a8a; font-weight:700;">
                      ${escapeHtml(hoursLabel(totalTarget))}
                    </td>
                    <td align="center" style="padding:13px 10px; font-size:12px;
                                              color:${behind ? '#dc2626' : '#15803d'}; font-weight:700;">
                      ${behind ? 'Behind Target' : 'On Track'}
                    </td>
                  </tr>
                </table>`;
}

export function buildApprovedPaceEmail(input: ApprovedPaceEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const isDay = input.variant === 'day';
  const isWeek = input.variant === 'week';
  const name = greetingName(input);
  const monthLabel = monthNameFromKey(input.month || input.periodStart);
  const weekRangeLabel = `${shortDate(input.periodStart)} – ${shortDate(input.periodEnd)}`;
  const periodLabel = isDay
    ? formatWorkDayLabel(input.periodStart)
    : isWeek
      ? `Week ${input.weekIndex} (${weekRangeLabel})`
      : `${monthLabel}, MTD`;
  const signer = signerFromAddress(input.fromEmail);
  const multiWeek = !isDay && (input.weekIndex > 1 || input.dayRows.length > 5);
  const effectiveTarget =
    input.effectiveHoursTarget != null &&
    Number.isFinite(input.effectiveHoursTarget) &&
    input.effectiveHoursTarget > 0
      ? input.effectiveHoursTarget
      : DAILY_EFFECTIVE_TARGET_HOURS;
  const missing = hoursLabel(input.hoursRemaining);
  const behind = input.paceDelta < 0;
  const goalWindow = isDay ? 'this day' : isWeek ? 'this week' : 'this month';
  const headerTitle = isDay
    ? 'Daily Hours Update'
    : isWeek
      ? 'Weekly Hours Update'
      : 'Weekly Hours Pacing Update';
  const targetRowLabel = isDay
    ? 'Daily hours target'
    : isWeek
      ? 'Weekly hours target'
      : `Hours target, MTD (Week ${input.weekIndex} × ${PACE_WEEKLY_HOURS}h)`;

  const intro = input.forManager
    ? `This email is an update on <strong>${escapeHtml(name)}</strong>'s working hours for <strong>${escapeHtml(periodLabel)}</strong>.`
    : `This email is being sent to provide an update for your working hours for <strong>${escapeHtml(periodLabel)}</strong>.`;

  const alertTitle = input.forManager
    ? `${escapeHtml(String(input.employeeName || 'Team member'))} is behind the hours goal.`
    : 'Your current pacing is behind your hours goal.';

  const alertBody = isDay
    ? input.forManager
      ? `They need about <strong>${escapeHtml(missing)}</strong> more effective hours to meet the ${escapeHtml(hoursLabel(effectiveTarget))} daily effective target for ${goalWindow}.`
      : `Please make sure you reach <strong>${escapeHtml(missing)}</strong> more effective hours to meet the ${escapeHtml(hoursLabel(effectiveTarget))} daily effective target for ${goalWindow}.`
    : input.forManager
      ? `They need about <strong>${escapeHtml(missing)}</strong> more working hours to meet their goals for ${goalWindow}.`
      : `Please make sure you track <strong>${escapeHtml(missing)}</strong> working hours to meet your goals for ${goalWindow}.`;

  const subject = isDay
    ? input.forManager
      ? `Team hours — ${String(input.employeeName || 'Employee')} (${periodLabel})`
      : `Daily Hours Update — ${periodLabel}`
    : isWeek
      ? input.forManager
        ? `Team weekly hours — ${String(input.employeeName || 'Employee')} (Week ${input.weekIndex})`
        : `Weekly Hours Update — Week ${input.weekIndex} (${weekRangeLabel})`
      : input.forManager
        ? `Team hours pacing — ${String(input.employeeName || 'Employee')} (Week ${input.weekIndex})`
        : `Weekly Hours Pacing Update — Week ${input.weekIndex}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(headerTitle)}</title>
</head>

<body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif; color:#1f2937;">

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
         style="width:100%; background-color:#f4f6f8;">
    <tr>
      <td align="center" style="padding:30px 15px;">

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
               style="max-width:680px; background-color:#ffffff; border:1px solid #e5e7eb;
                      border-radius:10px; overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background-color:#173b67; padding:24px 30px;">
              <h1 style="margin:0; color:#ffffff; font-size:22px; line-height:30px; font-weight:700;">
                ${escapeHtml(headerTitle)}
              </h1>

              <p style="margin:6px 0 0; color:#dbeafe; font-size:14px; line-height:20px;">
                Alyson Pulse working-hours summary · ${escapeHtml(periodLabel)}
              </p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding:30px;">

              <p style="margin:0 0 18px; font-size:16px; line-height:25px;">
                Hi <strong>${input.forManager ? 'there' : escapeHtml(name)}</strong>,
              </p>

              <p style="margin:0 0 18px; font-size:15px; line-height:24px;">
                ${intro}
              </p>

              ${
                behind
                  ? `<!-- Pacing Alert -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                     style="margin:0 0 24px; background-color:#fef2f2; border:1px solid #fecaca;
                            border-left:5px solid #dc2626; border-radius:6px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 5px; font-size:16px; line-height:22px;
                              color:#991b1b; font-weight:700;">
                      ${alertTitle}
                    </p>

                    <p style="margin:0; font-size:14px; line-height:22px; color:#7f1d1d;">
                      ${alertBody}
                    </p>
                  </td>
                </tr>
              </table>`
                  : ''
              }

              <!-- Summary -->
              <h2 style="margin:0 0 14px; font-size:18px; line-height:26px; color:#111827;">
                Hours summary
              </h2>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                     style="width:100%; border-collapse:collapse; margin-bottom:26px;
                            border:1px solid #e5e7eb;">

                <tr style="background-color:#f9fafb;">
                  <td style="padding:13px 15px; border-bottom:1px solid #e5e7eb;
                             font-size:14px; line-height:20px;">
                    ${escapeHtml(targetRowLabel)}
                  </td>
                  <td align="right" style="padding:13px 15px; border-bottom:1px solid #e5e7eb;
                                           font-size:14px; line-height:20px; font-weight:700;">
                    ${escapeHtml(hoursLabel(input.expectedHours))}
                  </td>
                </tr>

                ${
                  isDay
                    ? `<tr style="background-color:#f9fafb;">
                  <td style="padding:13px 15px; border-bottom:1px solid #e5e7eb;
                             font-size:14px; line-height:20px;">
                    Daily effective hours target
                  </td>
                  <td align="right" style="padding:13px 15px; border-bottom:1px solid #e5e7eb;
                                           font-size:14px; line-height:20px; font-weight:700;">
                    ${escapeHtml(hoursLabel(effectiveTarget))}
                  </td>
                </tr>`
                    : ''
                }

                <tr>
                  <td style="padding:13px 15px; border-bottom:1px solid #e5e7eb;
                             font-size:14px; line-height:20px;">
                    Total tracked time
                  </td>
                  <td align="right" style="padding:13px 15px; border-bottom:1px solid #e5e7eb;
                                           font-size:14px; line-height:20px; font-weight:700;">
                    ${escapeHtml(hoursLabel(input.hoursWorked))}
                  </td>
                </tr>

                <tr style="background-color:#fef2f2;">
                  <td style="padding:13px 15px; border-bottom:1px solid #e5e7eb;
                             font-size:14px; line-height:20px; color:#991b1b;">
                    Non-effective time
                  </td>
                  <td align="right" style="padding:13px 15px; border-bottom:1px solid #e5e7eb;
                                           font-size:14px; line-height:20px; color:#dc2626;
                                           font-weight:700;">
                    ${escapeHtml(hoursLabel(input.nonEffectiveHours))}
                  </td>
                </tr>

                <tr style="background-color:#f0fdf4;">
                  <td style="padding:13px 15px; border-bottom:1px solid #e5e7eb;
                             font-size:14px; line-height:20px; color:#166534; font-weight:700;">
                    Effective time
                  </td>
                  <td align="right" style="padding:13px 15px; border-bottom:1px solid #e5e7eb;
                                           font-size:14px; line-height:20px; color:#15803d;
                                           font-weight:700;">
                    ${escapeHtml(hoursLabel(input.effectiveHours))}
                  </td>
                </tr>

                <tr>
                  <td style="padding:13px 15px; border-bottom:1px solid #e5e7eb;
                             font-size:14px; line-height:20px;">
                    ${isDay ? 'Effective hours remaining to meet goal' : 'Hours remaining to meet goal'}
                  </td>
                  <td align="right" style="padding:13px 15px; border-bottom:1px solid #e5e7eb;
                                           font-size:14px; line-height:20px; font-weight:700;">
                    ${escapeHtml(hoursLabel(input.hoursRemaining))}
                  </td>
                </tr>

                <tr style="background-color:#f9fafb;">
                  <td style="padding:13px 15px; border-bottom:1px solid #e5e7eb;
                             font-size:14px; line-height:20px;">
                    Average daily pace
                  </td>
                  <td align="right" style="padding:13px 15px; border-bottom:1px solid #e5e7eb;
                                           font-size:14px; line-height:20px; font-weight:700;">
                    ${escapeHtml(hoursLabel(input.avgDailyPace))}
                  </td>
                </tr>

                <tr style="background-color:#fef2f2;">
                  <td style="padding:13px 15px; font-size:14px; line-height:20px;
                             color:#991b1b; font-weight:700;">
                    ${isDay ? 'Effective vs. target' : 'Pace vs. target'}
                  </td>
                  <td align="right" style="padding:13px 15px; font-size:14px; line-height:20px;
                                           color:#dc2626; font-weight:700;">
                    ${escapeHtml(hoursLabel(input.paceDelta))}
                  </td>
                </tr>

              </table>

              <!-- Breakdown -->
              <h2 style="margin:0 0 6px; font-size:18px; line-height:26px; color:#111827;">
                Day breakdown
              </h2>

              <p style="margin:0 0 14px; color:#6b7280; font-size:13px; line-height:20px;">
                The following breakdown shows tracked hours and low-activity time for each working day.
              </p>

              <div style="width:100%; overflow-x:auto; margin-bottom:26px;">
                ${buildDayRowsHtml(input.dayRows, multiWeek)}
              </div>

              <!-- Low Activity Notice -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                     style="margin-bottom:20px; background-color:#fef2f2; border:1px solid #fecaca;
                            border-radius:6px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 6px; font-size:14px; line-height:21px;
                              color:#991b1b; font-weight:700;">
                      Non-effective time
                    </p>

                    <p style="margin:0; font-size:13px; line-height:21px; color:#7f1d1d;">
                      Non-effective time for this period is
                      <strong>${escapeHtml(hoursLabel(input.nonEffectiveHours))}</strong>
                      (idle + low activity, capped at total tracked).
                      Effective time is total tracked minus non-effective
                      (<strong>${escapeHtml(hoursLabel(input.effectiveHours))}</strong>).
                      Check complete time logs on app.alyson.ai
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Automated Notice -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                     style="margin-bottom:24px; background-color:#eff6ff; border:1px solid #bfdbfe;
                            border-radius:6px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 6px; font-size:14px; line-height:21px;
                              color:#1e3a8a; font-weight:700;">
                      Automated system notice
                    </p>

                    <p style="margin:0; font-size:13px; line-height:21px; color:#1e40af;">
                      This is an automated report, and occasional discrepancies may occur (for example, the desktop timer includes live in-progress time before every session is fully synced). Approved leave is not currently included in these calculations. If pacing is behind because of approved leave, you do not need to worry about this message. Leave tracking will be integrated into the system soon — please CC people-ops@cintara.ai to make sure leaves are correctly logged. We generally work 8 hours a day. Payroll uses effective working hours (total tracked minus non-effective). Non-effective time combines idle and low-activity time. To be eligible for full salary, at least ${escapeHtml(hoursLabel(effectiveTarget))} of effective time is required each work day — anything below that can affect salary. Low activity during meeting times is also not considered and will not count.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 6px; font-size:15px; line-height:23px;">
                Best regards,
              </p>

              <p style="margin:0; font-size:15px; line-height:23px; font-weight:700;">
                ${escapeHtml(signer)}
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="background-color:#f9fafb; padding:18px 25px;
                                      border-top:1px solid #e5e7eb;">
              <p style="margin:0; color:#6b7280; font-size:12px; line-height:18px;">
                This email was generated automatically using Alyson Pulse tracking data.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;

  const text = [
    input.forManager ? `Hi,` : `Hi ${name},`,
    '',
    `Hours update for ${periodLabel}.`,
    isDay
      ? `Daily hours target: ${hoursLabel(input.expectedHours)}`
      : isWeek
        ? `Weekly hours target: ${hoursLabel(input.expectedHours)}`
        : `Target (MTD, Week ${input.weekIndex} × ${PACE_WEEKLY_HOURS}h): ${hoursLabel(input.expectedHours)}`,
    ...(isDay ? [`Daily effective hours target: ${hoursLabel(effectiveTarget)}`] : []),
    `Total tracked: ${hoursLabel(input.hoursWorked)}`,
    `Non-effective: ${hoursLabel(input.nonEffectiveHours)}`,
    `Effective: ${hoursLabel(input.effectiveHours)}`,
    `Remaining: ${hoursLabel(input.hoursRemaining)}`,
    `${isDay ? 'Effective vs target' : 'Pace vs target'}: ${hoursLabel(input.paceDelta)}`,
    '',
    `Best regards,`,
    signer,
  ].join('\n');

  return { subject, html, text };
}

/** Build day rows + summary metrics from daily maps. */
export function buildPaceEmailMetrics(opts: {
  dayKeys: string[];
  dailyHours: Map<string, number>;
  dailyLowActivity: Map<string, number>;
  dailyIdle: Map<string, number>;
  expectedHours: number;
  todayKey: string;
  /**
   * Per-day Eff. Target shown in the breakdown (default 7h).
   * Day status uses effective hours vs this target.
   */
  dailyTarget?: number;
  /**
   * When true (daily emails), remaining / pace delta use effective hours
   * vs dailyTarget instead of tracked vs expectedHours.
   */
  useEffectiveGoal?: boolean;
}): {
  hoursWorked: number;
  nonEffectiveHours: number;
  effectiveHours: number;
  hoursRemaining: number;
  avgDailyPace: number;
  projectedHours: number;
  paceDelta: number;
  dayRows: DayBreakdownRow[];
} {
  const dailyTarget =
    opts.dailyTarget != null && Number.isFinite(opts.dailyTarget) && opts.dailyTarget > 0
      ? opts.dailyTarget
      : PACE_DAILY_HOURS;

  let hoursWorked = 0;
  let nonEffectiveHours = 0;
  let effectiveHours = 0;
  const completedHours: number[] = [];

  const dayRows: DayBreakdownRow[] = opts.dayKeys.map((date) => {
    const tracked = Math.round((opts.dailyHours.get(date) ?? 0) * 100) / 100;
    const low = Math.round((opts.dailyLowActivity.get(date) ?? 0) * 100) / 100;
    const idle = Math.round((opts.dailyIdle.get(date) ?? 0) * 100) / 100;
    const eff = computeEffectiveTime(tracked, low, idle);
    hoursWorked += tracked;
    nonEffectiveHours += eff.non_effective_hours;
    effectiveHours += eff.effective_hours;

    let status: DayBreakdownRow['status'] = 'Pending';
    if (date < opts.todayKey) {
      status = eff.effective_hours + 0.05 >= dailyTarget ? 'On track' : 'Behind';
      completedHours.push(tracked);
    } else if (date === opts.todayKey) {
      status =
        eff.effective_hours + 0.05 >= dailyTarget
          ? 'On track'
          : tracked > 0
            ? 'Behind'
            : 'Pending';
      if (tracked > 0) completedHours.push(tracked);
    }

    return {
      date,
      trackedHours: tracked,
      nonEffectiveHours: eff.non_effective_hours,
      effectiveHours: eff.effective_hours,
      dailyTarget,
      status,
    };
  });

  hoursWorked = Math.round(hoursWorked * 100) / 100;
  nonEffectiveHours = Math.round(nonEffectiveHours * 100) / 100;
  effectiveHours = Math.round(effectiveHours * 100) / 100;
  const goalHours = opts.useEffectiveGoal ? dailyTarget : opts.expectedHours;
  const progressHours = opts.useEffectiveGoal ? effectiveHours : hoursWorked;
  const hoursRemaining =
    Math.round(Math.max(0, goalHours - progressHours) * 100) / 100;
  const avgDailyPace =
    completedHours.length > 0
      ? Math.round(
          (completedHours.reduce((a, b) => a + b, 0) / completedHours.length) * 100,
        ) / 100
      : 0;
  const projectedHours =
    Math.round(avgDailyPace * opts.dayKeys.length * 100) / 100;
  const paceDelta = Math.round((progressHours - goalHours) * 100) / 100;

  return {
    hoursWorked,
    nonEffectiveHours,
    effectiveHours,
    hoursRemaining,
    avgDailyPace,
    projectedHours,
    paceDelta,
    dayRows,
  };
}

function formatWorkDayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return dt.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export type DailyLowHoursEmailInput = {
  employeeName: string | null | undefined;
  department?: string | null;
  workDate: string;
  hoursWorked: number;
  hoursThreshold: number;
  lowActivityHours?: number;
  idleHours?: number;
  fromEmail: string;
  forManager?: boolean;
};

/**
 * Daily email uses the same HTML as weekly pace — only subject + date (vs MTD) differ.
 * Target is the daily threshold (typically 8h).
 */
export function buildDailyLowHoursEmail(input: DailyLowHoursEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const worked = Number(input.hoursWorked) || 0;
  const expected = Number(input.hoursThreshold) || 0;
  const low = Number(input.lowActivityHours) || 0;
  const idle = Number(input.idleHours) || 0;
  const metrics = buildPaceEmailMetrics({
    dayKeys: [input.workDate],
    dailyHours: new Map([[input.workDate, worked]]),
    dailyLowActivity: new Map([[input.workDate, low]]),
    dailyIdle: new Map([[input.workDate, idle]]),
    expectedHours: expected,
    todayKey: input.workDate,
    dailyTarget: DAILY_EFFECTIVE_TARGET_HOURS,
    useEffectiveGoal: true,
  });

  return buildApprovedPaceEmail({
    employeeName: input.employeeName,
    department: input.department,
    hoursWorked: metrics.hoursWorked,
    expectedHours: expected,
    nonEffectiveHours: metrics.nonEffectiveHours,
    effectiveHours: metrics.effectiveHours,
    hoursRemaining: metrics.hoursRemaining,
    avgDailyPace: metrics.avgDailyPace,
    paceDelta: metrics.paceDelta,
    periodStart: input.workDate,
    periodEnd: input.workDate,
    weekIndex: 1,
    month: input.workDate.slice(0, 7),
    dayRows: metrics.dayRows,
    fromEmail: input.fromEmail,
    forManager: input.forManager,
    variant: 'day',
    effectiveHoursTarget: DAILY_EFFECTIVE_TARGET_HOURS,
  });
}

