/**
 * HR pacing digest email — one HTML report of selected employees for hamza@.
 */

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtHours(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toFixed(2);
}

function statusLabel(status: unknown): string {
  return String(status || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Match Pulse UI severity colors for email clients. */
function statusColor(status: unknown): { bg: string; fg: string } {
  switch (String(status || '')) {
    case 'critical':
      return { bg: '#fff1f0', fg: '#cf1322' };
    case 'at_risk':
      return { bg: '#fff2e8', fg: '#d4380d' };
    case 'behind':
      return { bg: '#f0f5ff', fg: '#1d39c4' };
    case 'on_track':
      return { bg: '#e6f7ff', fg: '#096dd9' };
    case 'target_met':
      return { bg: '#f6ffed', fg: '#389e0d' };
    default:
      return { bg: '#fafafa', fg: '#595959' };
  }
}

export type PacingDigestRow = {
  name: string;
  email?: string | null;
  hoursWorkedLogged?: number;
  leaveHoursCredit?: number;
  hoursWorked?: number;
  targetHours?: number;
  avgDailyPace?: number;
  projectedPace?: number;
  paceDelta?: number;
  remainingWorkDays?: number;
  monthProgressPct?: number;
  status?: string;
};

export type PacingDigestEmailInput = {
  mode: 'weekly' | 'monthly';
  periodLabel: string;
  rollupDay: string;
  timezone: string;
  leaveHoursPerDay: number;
  rows: PacingDigestRow[];
  summary?: {
    critical?: number;
    at_risk?: number;
    behind?: number;
    on_track?: number;
    target_met?: number;
  };
};

export function buildPacingDigestEmail(input: PacingDigestEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const modeLabel = input.mode === 'weekly' ? 'Weekly' : 'Monthly';
  const subject = `Alyson Pulse · ${modeLabel} pacing · ${input.periodLabel} (${input.rows.length} employees)`;

  const summaryBits = [
    ['Critical', input.summary?.critical],
    ['At risk', input.summary?.at_risk],
    ['Behind', input.summary?.behind],
    ['On track', input.summary?.on_track],
    ['Met', input.summary?.target_met],
  ]
    .filter(([, n]) => n != null)
    .map(
      ([label, n]) =>
        `<span style="display:inline-block;margin:0 8px 8px 0;padding:4px 10px;border-radius:4px;background:#f5f5f5;font-size:13px;color:#262626;"><strong>${escapeHtml(label)}</strong> ${escapeHtml(n)}</span>`,
    )
    .join('');

  const progressCol = input.mode === 'monthly';

  const headerCells = [
    'Employee',
    'Logged',
    'Leave',
    'Worked',
    'Target',
    'Avg/day',
    'Projected',
    'Δ',
    'Left days',
    ...(progressCol ? ['Progress'] : []),
    'Status',
  ]
    .map(
      (h) =>
        `<th style="padding:10px 8px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.03em;color:#8c8c8c;border-bottom:2px solid #e8e8e8;white-space:nowrap;">${h}</th>`,
    )
    .join('');

  const bodyRows = input.rows
    .map((r) => {
      const delta = Number(r.paceDelta);
      const deltaColor =
        Number.isFinite(delta) && delta >= 0 ? '#389e0d' : '#cf1322';
      const st = statusColor(r.status);
      const cells = [
        `<td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;">
          <div style="font-weight:600;color:#262626;">${escapeHtml(r.name)}</div>
          <div style="font-size:12px;color:#8c8c8c;">${escapeHtml(r.email || '')}</div>
        </td>`,
        `<td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;">${fmtHours(r.hoursWorkedLogged)}</td>`,
        `<td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;">${fmtHours(r.leaveHoursCredit)}</td>`,
        `<td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;font-weight:600;">${fmtHours(r.hoursWorked)}</td>`,
        `<td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;">${fmtHours(r.targetHours)}</td>`,
        `<td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;">${fmtHours(r.avgDailyPace)}</td>`,
        `<td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;">${fmtHours(r.projectedPace)}</td>`,
        `<td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;color:${deltaColor};font-weight:600;">${fmtHours(r.paceDelta)}</td>`,
        `<td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;">${escapeHtml(r.remainingWorkDays ?? '—')}</td>`,
        ...(progressCol
          ? [
              `<td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;">${fmtHours(r.monthProgressPct)}%</td>`,
            ]
          : []),
        `<td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;">
          <span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${st.bg};color:${st.fg};font-size:12px;font-weight:600;">${escapeHtml(statusLabel(r.status))}</span>
        </td>`,
      ];
      return `<tr>${cells.join('')}</tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:960px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#173b67;padding:20px 24px;">
            <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#9fb4d1;">Alyson Pulse</div>
            <div style="font-size:22px;font-weight:700;color:#ffffff;margin-top:4px;">${escapeHtml(modeLabel)} pacing report</div>
            <div style="font-size:14px;color:#c5d4e8;margin-top:6px;">${escapeHtml(input.periodLabel)} · Rollup ${escapeHtml(input.rollupDay)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 24px 8px;">
            <div style="font-size:13px;color:#595959;margin-bottom:12px;">
              Leave credit ${escapeHtml(input.leaveHoursPerDay)}h/weekday · TZ ${escapeHtml(input.timezone)} ·
              ${escapeHtml(input.rows.length)} employee${input.rows.length === 1 ? '' : 's'} selected
            </div>
            ${summaryBits ? `<div style="margin-bottom:8px;">${summaryBits}</div>` : ''}
          </td>
        </tr>
        <tr>
          <td style="padding:0 16px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <thead><tr>${headerCells}</tr></thead>
              <tbody>${bodyRows || `<tr><td colspan="11" style="padding:16px;color:#8c8c8c;">No employees selected</td></tr>`}</tbody>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;background:#fafafa;border-top:1px solid #f0f0f0;font-size:12px;color:#8c8c8c;">
            Sent from Alyson Pulse · CSV attached with the same rows · hours include leave credit · Δ = projected − target
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textLines = [
    `${modeLabel} pacing · ${input.periodLabel}`,
    `Rollup ${input.rollupDay} · TZ ${input.timezone}`,
    'CSV attachment includes the full table.',
    '',
    ...input.rows.map(
      (r) =>
        `${r.name}: worked ${fmtHours(r.hoursWorked)} / target ${fmtHours(r.targetHours)} · projected ${fmtHours(r.projectedPace)} · Δ ${fmtHours(r.paceDelta)} · ${statusLabel(r.status)}`,
    ),
  ];

  return { subject, html, text: textLines.join('\n') };
}

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** CSV for pacing digest attachment (same columns as UI export). */
export function buildPacingDigestCsv(
  mode: 'weekly' | 'monthly',
  rows: PacingDigestRow[],
): string {
  const headers = [
    'Name',
    'Email',
    'Logged',
    'Leave credit',
    'Worked',
    'Target',
    'Avg daily',
    'Projected',
    'Delta',
    'Remaining days',
    ...(mode === 'monthly' ? ['Progress %'] : []),
    'Status',
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    const cols = [
      csvEscape(r.name),
      csvEscape(r.email || ''),
      csvEscape(fmtHours(r.hoursWorkedLogged)),
      csvEscape(fmtHours(r.leaveHoursCredit)),
      csvEscape(fmtHours(r.hoursWorked)),
      csvEscape(fmtHours(r.targetHours)),
      csvEscape(fmtHours(r.avgDailyPace)),
      csvEscape(fmtHours(r.projectedPace)),
      csvEscape(fmtHours(r.paceDelta)),
      csvEscape(r.remainingWorkDays ?? ''),
      ...(mode === 'monthly' ? [csvEscape(fmtHours(r.monthProgressPct))] : []),
      csvEscape(statusLabel(r.status)),
    ];
    lines.push(cols.join(','));
  }
  // BOM helps Excel open UTF-8 correctly
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
