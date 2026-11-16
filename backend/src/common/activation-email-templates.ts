/**
 * "Your account is activated" email, sent once when a user first signs in
 * (after choosing their permanent password). Carries the installer links for
 * each platform so they can set up the desktop app straight away.
 */

import { taviloEmailBrandLockup } from './tavilo-email-brand';
import { resolveDesktopDownloads, type DesktopDownloads } from './desktop-downloads';
import { resolvePulseAppUrl } from '../users/invite-email-templates';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function downloadRow(label: string, hint: string, href: string, file: string): string {
  return `<tr>
              <td style="padding:12px 14px;border-top:1px solid #e8e8e8;">
                <div style="font-size:14px;font-weight:600;color:#262626;">${escapeHtml(label)}</div>
                <div style="font-size:12px;color:#8c8c8c;margin-top:2px;">${escapeHtml(hint)}</div>
              </td>
              <td align="right" style="padding:12px 14px;border-top:1px solid #e8e8e8;white-space:nowrap;">
                <a href="${escapeHtml(href)}" aria-label="${escapeHtml(`Download for ${label} (${file})`)}" style="display:inline-block;background:#173b67;color:#ffffff;text-decoration:none;font-weight:600;font-size:13px;padding:8px 14px;border-radius:6px;">Download</a>
              </td>
            </tr>`;
}

export function buildActivationEmail(input: {
  firstName?: string | null;
  appUrl?: string | null;
  desktopVersion?: string | null;
  downloads?: DesktopDownloads;
}): { subject: string; html: string; text: string } {
  const firstName = String(input.firstName || '').trim() || 'there';
  const appUrl = resolvePulseAppUrl(input.appUrl);
  const signInUrl = `${appUrl}/signin`;
  const dl = input.downloads ?? resolveDesktopDownloads(input.desktopVersion);

  const subject = 'Your Tavilo Time account is activated';

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
            <div style="font-size:22px;font-weight:700;color:#ffffff;margin-top:4px;">Your account is activated</div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;">
            <p style="margin:0 0 16px;font-size:15px;color:#262626;line-height:1.5;">Hi ${escapeHtml(firstName)},</p>
            <p style="margin:0 0 20px;font-size:15px;color:#434343;line-height:1.55;">
              Your Tavilo Time account is now active. Install the desktop app on the computer you work on, then sign in with the same email and password you just set.
            </p>

            <div style="font-size:12px;color:#8c8c8c;text-transform:uppercase;letter-spacing:0.04em;margin:0 0 8px;">Download the desktop app</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;background:#f5f7fa;border-radius:6px;border:1px solid #e8e8e8;border-collapse:separate;">
              ${downloadRow('Windows', 'Windows 10 or later · .exe installer', dl.windows, 'Windows .exe')}
              ${downloadRow('Mac with Apple chip', 'M1, M2, M3 or newer · macOS 11 or later · .dmg', dl.macAppleSilicon, 'Mac Apple silicon .dmg')}
              ${downloadRow('Mac with Intel chip', 'macOS 10.14 or later · .dmg', dl.macIntel, 'Mac Intel .dmg')}
            </table>
            <p style="margin:0 0 20px;font-size:13px;color:#8c8c8c;line-height:1.5;">
              Not sure which Mac you have? Open the Apple menu, choose <strong>About This Mac</strong>, and look at <strong>Chip</strong> (Apple M-series) or <strong>Processor</strong> (Intel).
            </p>

            <ol style="margin:0 0 20px;padding-left:20px;color:#262626;font-size:15px;line-height:1.6;">
              <li style="margin-bottom:8px;">Open the installer you downloaded and follow the prompts. On a Mac, drag <strong>Tavilo Time</strong> into Applications.</li>
              <li style="margin-bottom:8px;">Launch <strong>Tavilo Time</strong> and sign in with your email and password.</li>
              <li>Press start when you begin work. You can also see your hours on the web app.</li>
            </ol>

            <p style="margin:0 0 16px;">
              <a href="${escapeHtml(signInUrl)}" style="display:inline-block;background:#173b67;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:6px;">Open Tavilo Time on the web</a>
            </p>
            <p style="margin:0;font-size:13px;color:#8c8c8c;line-height:1.5;">
              Download buttons not working? Get the latest installers from <a href="${escapeHtml(dl.releasesPage)}" style="color:#173b67;">${escapeHtml(dl.releasesPage)}</a>.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;background:#fafafa;border-top:1px solid #f0f0f0;font-size:12px;color:#8c8c8c;">
            Sent from Tavilo Time · If you did not just activate this account, contact your admin.
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
    'Your Tavilo Time account is now active. Install the desktop app on the computer you work on, then sign in with the same email and password you just set.',
    '',
    'Download the desktop app:',
    `- Windows (Windows 10 or later): ${dl.windows}`,
    `- Mac with Apple chip (M1/M2/M3 or newer, macOS 11+): ${dl.macAppleSilicon}`,
    `- Mac with Intel chip (macOS 10.14+): ${dl.macIntel}`,
    '',
    'Not sure which Mac you have? Apple menu > About This Mac: "Chip" means Apple chip, "Processor" means Intel.',
    '',
    '1. Open the installer and follow the prompts. On a Mac, drag Tavilo Time into Applications.',
    '2. Launch Tavilo Time and sign in with your email and password.',
    '3. Press start when you begin work.',
    '',
    `Web app: ${signInUrl}`,
    `Latest installers: ${dl.releasesPage}`,
  ].join('\n');

  return { subject, html, text };
}
