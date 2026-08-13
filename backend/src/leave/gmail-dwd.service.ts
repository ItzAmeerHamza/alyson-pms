import { createSign } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type GmailListedMessage = {
  id: string;
  threadId: string;
};

export type GmailFetchedMessage = {
  id: string;
  threadId: string;
  from: string | null;
  to: string | null;
  subject: string | null;
  snippet: string | null;
  bodyText: string | null;
  receivedAt: Date | null;
};

/**
 * Google Workspace Domain-Wide Delegation → Gmail API (readonly).
 * Impersonates GOOGLE_DWD_SUBJECT (default people-ops@cintara.ai).
 */
@Injectable()
export class GmailDwdService {
  private readonly logger = new Logger(GmailDwdService.name);
  private cachedToken: { accessToken: string; expiresAtMs: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.clientEmail() && this.privateKey());
  }

  subjectEmail(): string {
    // Impersonate a real Workspace user (group mailboxes are not users).
    return (
      this.config.get<string>('GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL') ||
      this.config.get<string>('GOOGLE_DWD_SUBJECT') ||
      this.config.get<string>('LEAVE_GMAIL_SUBJECT') ||
      this.config.get<string>('LEAVE_EMAIL_GMAIL_USER') ||
      'people-ops@cintara.ai'
    );
  }

  /** People Ops mailbox / Google Group used in Gmail query filters. */
  mailboxFilter(): string {
    return (
      this.config.get<string>('LEAVE_EMAIL_MAILBOX') ||
      this.config.get<string>('GOOGLE_DWD_SUBJECT') ||
      'people-ops@cintara.ai'
    );
  }

  /**
   * Build Gmail search for leave intake.
   * people-ops is often a Group — impersonate a user and filter to/cc/deliveredto.
   */
  buildLeaveQuery(opts: { lookbackDays: number; customQuery?: string }): string {
    if (opts.customQuery?.trim()) return opts.customQuery.trim();
    const days = Math.max(1, opts.lookbackDays);
    const box = this.mailboxFilter().toLowerCase();
    const impersonateMailbox =
      String(this.config.get<string>('LEAVE_EMAIL_IMPERSONATE_MAILBOX') || '').toLowerCase() ===
      'true';
    // newer_than:Nd is inclusive of the window (unlike exclusive after:YYYY/MM/DD).
    if (impersonateMailbox) {
      return `in:anywhere newer_than:${days}d`;
    }
    return (
      `in:anywhere newer_than:${days}d ` +
      `(to:${box} OR cc:${box} OR bcc:${box} OR deliveredto:${box} OR list:${box})`
    );
  }

  private afterDateKey(lookbackDays: number): string {
    // Kept for callers that need a calendar date; Gmail search uses newer_than:Nd.
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - Math.max(1, lookbackDays));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  }

  async listMessages(opts?: {
    query?: string;
    maxResults?: number;
    lookbackDays?: number;
  }): Promise<GmailListedMessage[]> {
    const accessToken = await this.getAccessToken();
    const maxResults = Math.min(Math.max(opts?.maxResults ?? 100, 1), 300);
    const lookbackDays = opts?.lookbackDays ?? 30;
    const q =
      opts?.query?.trim() ||
      this.buildLeaveQuery({ lookbackDays }) ||
      this.config.get<string>('LEAVE_GMAIL_QUERY') ||
      `newer_than:${lookbackDays}d`;

    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    url.searchParams.set('q', q);
    url.searchParams.set('maxResults', String(maxResults));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Gmail list failed: ${res.status} ${body.slice(0, 300)}`);
      throw new Error(`Gmail list failed (${res.status})`);
    }
    const data = (await res.json()) as {
      messages?: Array<{ id?: string; threadId?: string }>;
    };
    return (data.messages || [])
      .filter((m) => m.id)
      .map((m) => ({ id: String(m.id), threadId: String(m.threadId || '') }));
  }

  async getMessage(messageId: string): Promise<GmailFetchedMessage> {
    const accessToken = await this.getAccessToken();
    const url = new URL(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`,
    );
    url.searchParams.set('format', 'full');

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Gmail get failed: ${res.status} ${body.slice(0, 300)}`);
      throw new Error(`Gmail get failed (${res.status})`);
    }

    const data = (await res.json()) as {
      id?: string;
      threadId?: string;
      snippet?: string;
      internalDate?: string;
      payload?: GmailPayload;
    };

    const headers = this.flattenHeaders(data.payload);
    const bodyText = this.extractPlainText(data.payload);
    const internalMs = data.internalDate ? Number(data.internalDate) : NaN;

    return {
      id: String(data.id || messageId),
      threadId: String(data.threadId || ''),
      from: headers.from,
      to: headers.to,
      subject: headers.subject,
      snippet: data.snippet ? String(data.snippet) : null,
      bodyText,
      receivedAt: Number.isFinite(internalMs) ? new Date(internalMs) : null,
    };
  }

  /**
   * AlysonHR uses GOOGLE_DWD_SERVICE_ACCOUNT_JSON (full SA JSON).
   * Pulse SAM deploy prefers split GOOGLE_DWD_CLIENT_EMAIL + GOOGLE_DWD_PRIVATE_KEY.
   * Both shapes are accepted.
   */
  private serviceAccountFromJson(): { clientEmail: string; privateKey: string } | null {
    const raw =
      this.config.get<string>('GOOGLE_DWD_SERVICE_ACCOUNT_JSON') ||
      this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_JSON') ||
      null;
    if (!raw || !String(raw).trim()) return null;
    try {
      const parsed = JSON.parse(String(raw)) as {
        client_email?: string;
        private_key?: string;
      };
      const clientEmail = String(parsed.client_email || '').trim();
      const privateKey = String(parsed.private_key || '').replace(/\\n/g, '\n').trim();
      if (!clientEmail || !privateKey) return null;
      return { clientEmail, privateKey };
    } catch {
      this.logger.warn('GOOGLE_DWD_SERVICE_ACCOUNT_JSON is not valid JSON');
      return null;
    }
  }

  private clientEmail(): string | null {
    const fromJson = this.serviceAccountFromJson()?.clientEmail;
    if (fromJson) return fromJson;
    return (
      this.config.get<string>('GOOGLE_DWD_CLIENT_EMAIL') ||
      this.config.get<string>('GOOGLE_DWD_SERVICE_ACCOUNT_EMAIL') ||
      this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_EMAIL') ||
      null
    );
  }

  private privateKey(): string | null {
    const fromJson = this.serviceAccountFromJson()?.privateKey;
    if (fromJson) return fromJson;
    const raw =
      this.config.get<string>('GOOGLE_DWD_PRIVATE_KEY') ||
      this.config.get<string>('GOOGLE_DWD_PRIVATE_KEY_B64') ||
      this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY') ||
      null;
    if (!raw) return null;
    const trimmed = String(raw).trim().replace(/^['"]|['"]$/g, '');
    // SAM --parameter-overrides splits on spaces; deploy.sh may pass base64 PEM.
    if (!trimmed.includes('BEGIN') && /^[A-Za-z0-9+/=\s]+$/.test(trimmed)) {
      try {
        const decoded = Buffer.from(trimmed.replace(/\s+/g, ''), 'base64').toString('utf8');
        if (decoded.includes('BEGIN')) {
          return decoded.replace(/\\n/g, '\n').trim();
        }
      } catch {
        /* fall through */
      }
    }
    return trimmed.replace(/\\n/g, '\n');
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAtMs > now + 60_000) {
      return this.cachedToken.accessToken;
    }

    const email = this.clientEmail();
    const key = this.privateKey();
    if (!email || !key) {
      throw new Error('Google DWD credentials are not configured');
    }

    const iat = Math.floor(now / 1000);
    const exp = iat + 3600;
    const claim = {
      iss: email,
      sub: this.subjectEmail(),
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat,
      exp,
    };

    const assertion = this.signJwt(claim, key);
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Google token exchange failed: ${res.status} ${text.slice(0, 300)}`);
      throw new Error(`Google token exchange failed (${res.status})`);
    }
    const token = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!token.access_token) {
      throw new Error('Google token response missing access_token');
    }
    const expiresIn = Number(token.expires_in) || 3600;
    this.cachedToken = {
      accessToken: token.access_token,
      expiresAtMs: now + expiresIn * 1000,
    };
    return token.access_token;
  }

  private signJwt(payload: Record<string, unknown>, privateKeyPem: string): string {
    const header = { alg: 'RS256', typ: 'JWT' };
    const enc = (obj: unknown) =>
      Buffer.from(JSON.stringify(obj))
        .toString('base64url')
        .replace(/=+$/, '');
    const unsigned = `${enc(header)}.${enc(payload)}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    const signature = signer.sign(privateKeyPem).toString('base64url').replace(/=+$/, '');
    return `${unsigned}.${signature}`;
  }

  private flattenHeaders(payload?: GmailPayload): {
    from: string | null;
    to: string | null;
    subject: string | null;
  } {
    const headers = payload?.headers || [];
    const get = (name: string) => {
      const hit = headers.find((h) => String(h.name || '').toLowerCase() === name);
      return hit?.value ? String(hit.value) : null;
    };
    return { from: get('from'), to: get('to'), subject: get('subject') };
  }

  private extractPlainText(payload?: GmailPayload): string | null {
    if (!payload) return null;
    const parts: string[] = [];
    const walk = (node: GmailPayload | undefined) => {
      if (!node) return;
      const mime = String(node.mimeType || '').toLowerCase();
      if (mime === 'text/plain' && node.body?.data) {
        parts.push(this.decodeBody(node.body.data));
      }
      if (Array.isArray(node.parts)) {
        for (const p of node.parts) walk(p);
      }
    };
    walk(payload);
    if (parts.length === 0 && payload.body?.data && String(payload.mimeType || '').includes('text')) {
      parts.push(this.decodeBody(payload.body.data));
    }
    const text = parts.join('\n').trim();
    return text ? text.slice(0, 20000) : null;
  }

  private decodeBody(data: string): string {
    try {
      return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    } catch {
      return '';
    }
  }
}

type GmailPayload = {
  mimeType?: string;
  headers?: Array<{ name?: string; value?: string }>;
  body?: { data?: string };
  parts?: GmailPayload[];
};
