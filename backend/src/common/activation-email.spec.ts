import { describe, expect, it, vi } from 'vitest';
import { AccountActivationService } from './account-activation.service';
import { buildActivationEmail } from './activation-email-templates';
import {
  DEFAULT_DESKTOP_VERSION,
  resolveDesktopDownloads,
  resolveDesktopVersion,
} from './desktop-downloads';

describe('desktop download links', () => {
  it('builds the exact asset names electron-builder publishes', () => {
    const dl = resolveDesktopDownloads('1.0.249');
    const base = 'https://github.com/revcloud/alyson-td-releases/releases/download/v1.0.249';
    expect(dl.windows).toBe(`${base}/Alyson.PM.Setup.1.0.249.exe`);
    expect(dl.macAppleSilicon).toBe(`${base}/Alyson.PM-1.0.249-arm64.dmg`);
    expect(dl.macIntel).toBe(`${base}/Alyson.PM-1.0.249.dmg`);
  });

  it('accepts a leading v and rejects values that could inject into the URL', () => {
    expect(resolveDesktopVersion('v1.0.300')).toBe('1.0.300');
    expect(resolveDesktopVersion('1.0.300/../../evil')).toBe(DEFAULT_DESKTOP_VERSION);
    expect(resolveDesktopVersion('latest')).toBe(DEFAULT_DESKTOP_VERSION);
    expect(resolveDesktopVersion(undefined)).toBe(DEFAULT_DESKTOP_VERSION);
  });
});

describe('activation email', () => {
  it('says the account is activated and links every installer', () => {
    const mail = buildActivationEmail({ firstName: 'Garima', desktopVersion: '1.0.250' });
    const dl = resolveDesktopDownloads('1.0.250');

    expect(mail.subject).toBe('Your Tavilo Time account is activated');
    expect(mail.html).toContain('Your account is activated');
    expect(mail.html).toContain('Hi Garima,');
    expect(mail.html).toContain('cid:tavilo-logo');
    for (const url of [dl.windows, dl.macAppleSilicon, dl.macIntel, dl.releasesPage]) {
      expect(mail.html).toContain(url);
      expect(mail.text).toContain(url);
    }
    expect(mail.html).toContain('https://app.alyson.ai/signin');
    expect(mail.html).toContain('About This Mac');
    expect(mail.html).not.toContain('temporary password');
  });

  it('honours a configured web app URL and falls back to a greeting without a name', () => {
    const mail = buildActivationEmail({ firstName: '  ', appUrl: 'https://app.tavilo.ai/' });
    expect(mail.html).toContain('Hi there,');
    expect(mail.html).toContain('https://app.tavilo.ai/signin');
  });

  it('escapes the name', () => {
    const mail = buildActivationEmail({ firstName: 'Ada <script>' });
    expect(mail.html).toContain('Ada &lt;script&gt;');
    expect(mail.html).not.toContain('<script>');
  });
});

function makeActivation(opts?: {
  rows?: Array<{ email: string | null; first_name: string | null }>;
  config?: Record<string, string>;
  sesEnabled?: boolean;
  send?: () => Promise<unknown>;
  queryError?: Error;
}) {
  const query = vi.fn(async () => {
    if (opts?.queryError) throw opts.queryError;
    return { rows: opts?.rows ?? [] };
  });
  const send = vi.fn(opts?.send ?? (async () => ({ ok: true, messageId: 'm1' })));
  const service = new AccountActivationService(
    { query } as never,
    { get: (key: string) => opts?.config?.[key] } as never,
    { isEnabled: () => opts?.sesEnabled ?? true, send } as never,
  );
  return { service, query, send };
}

describe('AccountActivationService.recordFirstSignIn', () => {
  it('sends the activation email when this call flips Invited → Active', async () => {
    const { service, query, send } = makeActivation({
      rows: [{ email: 'Garima@Example.com', first_name: 'Garima' }],
      config: { DESKTOP_DOWNLOAD_VERSION: '1.0.250' },
    });

    await expect(service.recordFirstSignIn(1224)).resolves.toBe(true);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('signed_in_at IS NULL');
    expect(sql).toContain('RETURNING');
    expect(params).toEqual([1224]);
    expect(send).toHaveBeenCalledTimes(1);
    const mail = (send.mock.calls[0] as unknown as [Record<string, string>])[0];
    expect(mail.to).toBe('garima@example.com');
    expect(mail.subject).toBe('Your Tavilo Time account is activated');
    expect(mail.html).toContain('Alyson.PM.Setup.1.0.250.exe');
  });

  it('does not email when the user was already active (no row flipped)', async () => {
    const { service, send } = makeActivation({ rows: [] });
    await expect(service.recordFirstSignIn(1224)).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('only one of two concurrent sign-ins sends mail', async () => {
    // The database lets exactly one UPDATE win; the loser gets no row back.
    let claimed = false;
    const query = vi.fn(async () => {
      if (claimed) return { rows: [] };
      claimed = true;
      return { rows: [{ email: 'a@b.co', first_name: 'A' }] };
    });
    const send = vi.fn(async () => ({ ok: true, messageId: 'm' }));
    const service = new AccountActivationService(
      { query } as never,
      { get: () => undefined } as never,
      { isEnabled: () => true, send } as never,
    );
    const results = await Promise.all([service.recordFirstSignIn(7), service.recordFirstSignIn(7)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('can be switched off with ACTIVATION_EMAIL_ENABLED=false but still reports activation', async () => {
    const { service, send } = makeActivation({
      rows: [{ email: 'a@b.co', first_name: 'A' }],
      config: { ACTIVATION_EMAIL_ENABLED: 'false' },
    });
    await expect(service.recordFirstSignIn(1)).resolves.toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it('skips quietly when SES is not configured or the user has no email', async () => {
    const noSes = makeActivation({ rows: [{ email: 'a@b.co', first_name: 'A' }], sesEnabled: false });
    await expect(noSes.service.recordFirstSignIn(1)).resolves.toBe(true);
    expect(noSes.send).not.toHaveBeenCalled();

    const noEmail = makeActivation({ rows: [{ email: null, first_name: 'A' }] });
    await expect(noEmail.service.recordFirstSignIn(1)).resolves.toBe(true);
    expect(noEmail.send).not.toHaveBeenCalled();
  });

  it('never throws when the email send fails or the worker throws', async () => {
    const failed = makeActivation({
      rows: [{ email: 'a@b.co', first_name: 'A' }],
      send: async () => ({ ok: false, code: 'SEND_FAILED' }),
    });
    await expect(failed.service.recordFirstSignIn(1)).resolves.toBe(true);

    const threw = makeActivation({
      rows: [{ email: 'a@b.co', first_name: 'A' }],
      send: async () => {
        throw new Error('boom');
      },
    });
    await expect(threw.service.recordFirstSignIn(1)).resolves.toBe(true);
  });

  it('does not wait forever on a stuck email send', async () => {
    vi.useFakeTimers();
    try {
      const { service } = makeActivation({
        rows: [{ email: 'a@b.co', first_name: 'A' }],
        send: () => new Promise(() => undefined),
      });
      const pending = service.recordFirstSignIn(1);
      await vi.advanceTimersByTimeAsync(4500);
      await expect(pending).resolves.toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns false instead of throwing when the database stamp fails', async () => {
    const { service, send } = makeActivation({ queryError: new Error('db down') });
    await expect(service.recordFirstSignIn(1)).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
