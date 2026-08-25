import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PULSE_APP_URL,
  buildInviteEmail,
  resolvePulseAppUrl,
} from './invite-email-templates';

describe('invite email', () => {
  it('defaults the portal URL to app.alyson.ai', () => {
    expect(resolvePulseAppUrl(null)).toBe(DEFAULT_PULSE_APP_URL);
    expect(resolvePulseAppUrl('https://app.alyson.ai/')).toBe('https://app.alyson.ai');
    expect(resolvePulseAppUrl('not-a-url')).toBe(DEFAULT_PULSE_APP_URL);
  });

  it('includes activation steps, temp password, and desktop-app instructions', () => {
    const mail = buildInviteEmail({
      firstName: 'Ada',
      email: 'ada@cintara.ai',
      temporaryPassword: 'Tmp#Pass12',
    });

    expect(mail.subject).toMatch(/activate your account/i);
    expect(mail.html).toContain('Activate your account');
    expect(mail.html).toContain('https://app.alyson.ai/signin');
    expect(mail.html).toContain('app.alyson.ai');
    expect(mail.html).toContain('Tmp#Pass12');
    expect(mail.html).toContain('set a new password');
    expect(mail.html).toContain('Alyson Time Doctor');
    expect(mail.html).toContain('/dashboard/alyson-pulse/download');
    expect(mail.text).toContain('Temporary password: Tmp#Pass12');
    expect(mail.text).toContain('desktop app');
  });

  it('escapes HTML in the name and password', () => {
    const mail = buildInviteEmail({
      firstName: 'Ada <script>',
      email: 'ada@cintara.ai',
      temporaryPassword: 'a<b>&c',
    });
    expect(mail.html).toContain('Ada &lt;script&gt;');
    expect(mail.html).toContain('a&lt;b&gt;&amp;c');
    expect(mail.html).not.toContain('<script>');
  });
});
