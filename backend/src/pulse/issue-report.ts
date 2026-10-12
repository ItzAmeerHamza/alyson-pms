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
  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;color:#0f172a;">
<p><strong>${escapeHtml(name)}</strong> (${escapeHtml(email)}) reported a ${escapeHtml(category.toLowerCase())} issue from Tavilo Time.</p>
<p style="color:#64748b;">App ${escapeHtml(version)} · ${escapeHtml(platform)} · ${escapeHtml(osSummary)}</p>
<pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(message)}</pre>
${
  diagnostics
    ? `<h3>Diagnostics</h3><pre style="white-space:pre-wrap;font-size:12px;">${escapeHtml(diagnostics)}</pre>`
    : '<p>No diagnostics were included.</p>'
}
</body></html>`;
  return { subject, html, text };
}
