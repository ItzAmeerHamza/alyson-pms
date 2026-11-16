import { taviloEmailBrandLockup } from '../common/tavilo-email-brand';

export const ISSUE_CATEGORIES = [
  'tracking',
  'screenshots',
  'login',
  'permissions',
  'updates',
  'other',
] as const;

export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export const ISSUE_CATEGORY_LABELS: Record<IssueCategory, string> = {
  tracking: 'Time tracking',
  screenshots: 'Screenshots',
  login: 'Sign-in or password',
  permissions: 'Permissions',
  updates: 'App update',
  other: 'Something else',
};

export const ISSUE_REPORT_HOURLY_LIMIT = 8;
export const ISSUE_MESSAGE_MAX = 4000;
export const ISSUE_DIAGNOSTICS_MAX = 12000;
export const ISSUE_EMAIL_DIAGNOSTICS_MAX = 4000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isIssueCategory(value: string): value is IssueCategory {
  return (ISSUE_CATEGORIES as readonly string[]).includes(value);
}

export function issueCategoryLabel(category: string): string {
  return isIssueCategory(category) ? ISSUE_CATEGORY_LABELS[category] : 'Issue';
}

export function redactSecrets(value: string): string {
  return value
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[redacted]');
}

export function cleanIssueText(value: unknown, max: number): string {
  return redactSecrets(String(value ?? '').replace(/\u0000/g, ''))
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, max);
}

export function oneLine(value: unknown, max: number): string {
  return cleanIssueText(value, max).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseIssueRecipients(raw: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(raw ?? '').split(',')) {
    const email = part.trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.endsWith('@example.com') || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
    if (out.length >= 15) break;
  }
  return out;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildIssueEmail(input: {
  category: string;
  message: string;
  reporterName: string;
  reporterEmail: string;
  appVersion: string;
  platform: string;
  osSummary: string;
  diagnostics: string | null;
}): { subject: string; html: string; text: string } {
  const category = issueCategoryLabel(input.category);
  const name = oneLine(input.reporterName, 120) || 'Employee';
  const email = oneLine(input.reporterEmail, 200) || 'unknown';
  const version = oneLine(input.appVersion, 40) || 'unknown';
  const platform = oneLine(input.platform, 32) || 'unknown';
  const osSummary = oneLine(input.osSummary, 160) || 'unknown';
  const message = cleanIssueText(input.message, ISSUE_MESSAGE_MAX);
  const diagnostics = input.diagnostics
    ? cleanIssueText(input.diagnostics, ISSUE_EMAIL_DIAGNOSTICS_MAX)
    : '';
  const subject = `Tavilo Time issue: ${category}`;
  const text = [
    `${name} (${email}) reported a ${category.toLowerCase()} issue from Tavilo Time.`,
    '',
    `App ${version} · ${platform} · ${osSummary}`,
    '',
    message,
    diagnostics ? `\n--- Diagnostics ---\n${diagnostics}` : '',
  ]
    .filter((part) => part !== '')
    .join('\n');
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#173b67;padding:20px 24px;">
            ${taviloEmailBrandLockup()}
            <div style="font-size:22px;font-weight:700;color:#ffffff;margin-top:4px;">Issue report</div>
            <div style="font-size:14px;color:#c5d4e8;margin-top:6px;">${escapeHtml(category)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;">
            <p style="margin:0 0 8px;font-size:15px;color:#262626;line-height:1.5;"><strong>${escapeHtml(name)}</strong> reported this from Tavilo Time.</p>
            <p style="margin:0 0 20px;font-size:14px;color:#595959;line-height:1.5;">${escapeHtml(email)}</p>
            <div style="margin:0 0 20px;padding:14px 16px;background:#f5f7fa;border-radius:6px;border:1px solid #e8e8e8;font-size:13px;color:#595959;line-height:1.5;">
              App ${escapeHtml(version)} · ${escapeHtml(platform)} · ${escapeHtml(osSummary)}
            </div>
            <div style="font-size:12px;color:#8c8c8c;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">What happened</div>
            <p style="margin:0 0 20px;font-size:15px;color:#262626;line-height:1.55;white-space:pre-wrap;">${escapeHtml(message)}</p>
            ${
              diagnostics
                ? `<div style="font-size:12px;color:#8c8c8c;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">Diagnostics</div>
            <pre style="margin:0;padding:14px 16px;background:#fafafa;border:1px solid #f0f0f0;border-radius:6px;white-space:pre-wrap;font-size:12px;line-height:1.5;color:#434343;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(diagnostics)}</pre>`
                : '<p style="margin:0;font-size:14px;color:#8c8c8c;">No diagnostics were included.</p>'
            }
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;background:#fafafa;border-top:1px solid #f0f0f0;font-size:12px;color:#8c8c8c;">
            Sent from Tavilo Time · Employee issue report
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, html, text };
}
