/**
 * Pulse invite email — same visual language as pacing / low-hours SES mail.
 * Cognito's default AdminCreateUser email is suppressed; this is what employees get.
 */

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const DEFAULT_PULSE_APP_URL = 'https://app.alyson.ai';
export const DEFAULT_PULSE_DOWNLOAD_PATH = '/dashboard/alyson-pulse/download';

export function resolvePulseAppUrl(raw?: string | null): string {
  const trimmed = String(raw || '').trim().replace(/\/+$/, '');
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  return DEFAULT_PULSE_APP_URL;
}

export function buildInviteEmail(input: {
  firstName: string;
  email: string;
  temporaryPassword: string;
  appUrl?: string;
}): { subject: string; html: string; text: string } {
  const firstName = String(input.firstName || '').trim() || 'there';
  const email = String(input.email || '').trim().toLowerCase();
  const password = String(input.temporaryPassword || '');
  const appUrl = resolvePulseAppUrl(input.appUrl);
  const signInUrl = `${appUrl}/signin`;
  const downloadUrl = `${appUrl}${DEFAULT_PULSE_DOWNLOAD_PATH}`;
  const appHost = appUrl.replace(/^https?:\/\//i, '');

  const subject = 'Welcome to Alyson Pulse — activate your account';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#173b67;padding:20px 24px;">
            <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#9fb4d1;">Alyson Pulse</div>
            <div style="font-size:22px;font-weight:700;color:#ffffff;margin-top:4px;">Activate your account</div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;">
            <p style="margin:0 0 16px;font-size:15px;color:#262626;line-height:1.5;">Hi ${escapeHtml(firstName)},</p>
            <p style="margin:0 0 20px;font-size:15px;color:#434343;line-height:1.55;">
              You have been invited to Alyson Pulse. Follow these steps to activate your account and start tracking time.
            </p>

            <div style="margin:0 0 20px;padding:14px 16px;background:#f5f7fa;border-radius:6px;border:1px solid #e8e8e8;">
              <div style="font-size:12px;color:#8c8c8c;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">Sign in with</div>
              <div style="font-size:14px;color:#262626;margin-bottom:6px;"><strong>Email</strong> ${escapeHtml(email)}</div>
              <div style="font-size:14px;color:#262626;"><strong>Temporary password</strong> <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(password)}</span></div>
            </div>

            <ol style="margin:0 0 20px;padding-left:20px;color:#262626;font-size:15px;line-height:1.6;">
              <li style="margin-bottom:10px;">Go to <a href="${escapeHtml(signInUrl)}" style="color:#173b67;font-weight:600;">${escapeHtml(appHost)}</a> and sign in with the email and temporary password above.</li>
              <li style="margin-bottom:10px;">The app will ask you to <strong>set a new password</strong>. Choose one you will remember — the temporary password only works once.</li>
              <li>After your new password is saved, download the <strong>Alyson Time Doctor</strong> desktop app and sign in with the same email and new password to start tracking time.</li>
            </ol>

            <p style="margin:0 0 16px;">
              <a href="${escapeHtml(signInUrl)}" style="display:inline-block;background:#173b67;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:6px;">Open Alyson Pulse</a>
            </p>
            <p style="margin:0;font-size:13px;color:#8c8c8c;line-height:1.5;">
              Desktop app: <a href="${escapeHtml(downloadUrl)}" style="color:#173b67;">${escapeHtml(downloadUrl)}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;background:#fafafa;border-top:1px solid #f0f0f0;font-size:12px;color:#8c8c8c;">
            Sent from Alyson Pulse · If you were not expecting this invite, you can ignore this email.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `Hi ${firstName},`,
    '',
    'You have been invited to Alyson Pulse. Activate your account:',
    '',
    `1. Go to ${signInUrl} and sign in with:`,
    `   Email: ${email}`,
    `   Temporary password: ${password}`,
    '2. The app will ask you to set a new password. The temporary password only works once.',
    '3. After that, download the Alyson Time Doctor desktop app and sign in with the same email and your new password to start tracking time.',
    '',
    `Desktop app: ${downloadUrl}`,
  ].join('\n');

  return { subject, html, text };
}
