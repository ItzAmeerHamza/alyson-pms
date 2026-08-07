import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

/**
 * Non-VPC Lambda: send mail via public SES API.
 *
 * The API Lambda runs in VPC without NAT. It invokes this function through the
 * existing Lambda interface VPC endpoint (PrivateDnsEnabled=false) — same pattern
 * as cognito-admin-handler. Do not add SES VPC endpoints or change Private DNS.
 */

export type SesEmailEvent = {
  action: 'send';
  to: string[];
  /** Optional CC recipients (e.g. managers on employee pacing emails). */
  cc?: string[];
  subject: string;
  html: string;
  text?: string;
  /** Optional override; defaults to EMAIL_FROM env on the worker. */
  from?: string;
};

/** Flat shape so Nest tsc (strictNullChecks off) can read failure fields. */
export type SesEmailResult = {
  ok: boolean;
  messageId?: string;
  code?: string;
  message?: string;
};

let client: SESv2Client | null = null;

function getClient(): SESv2Client {
  if (!client) {
    const region = process.env.AWS_REGION || process.env.SES_REGION || 'us-west-2';
    client = new SESv2Client({ region });
  }
  return client;
}

function defaultFrom(): string {
  return (process.env.EMAIL_FROM || '').trim() || 'hamza@cintara.ai';
}

export const handler = async (event: SesEmailEvent): Promise<SesEmailResult> => {
  if (event?.action !== 'send') {
    return { ok: false, code: 'ERROR', message: 'Unknown action' };
  }

  const to = (event.to || [])
    .map((addr) => String(addr || '').trim().toLowerCase())
    .filter(Boolean);
  const toSet = new Set(to);
  const cc = (event.cc || [])
    .map((addr) => String(addr || '').trim().toLowerCase())
    .filter((addr) => addr && !toSet.has(addr));
  const subject = String(event.subject || '').trim();
  const html = String(event.html || '').trim();
  const from = String(event.from || defaultFrom()).trim();

  if (!to.length || !subject || !html || !from) {
    return {
      ok: false,
      code: 'ERROR',
      message: 'from, to, subject, and html are required',
    };
  }

  try {
    const result = await getClient().send(
      new SendEmailCommand({
        FromEmailAddress: from,
        Destination: {
          ToAddresses: to,
          ...(cc.length ? { CcAddresses: cc } : {}),
        },
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: 'UTF-8' },
            Body: {
              Html: { Data: html, Charset: 'UTF-8' },
              ...(event.text
                ? { Text: { Data: String(event.text), Charset: 'UTF-8' } }
                : {}),
            },
          },
        },
      }),
    );
    const messageId = result.MessageId || '';
    console.log(
      `ses-email send ok to=${to.join(',')}${cc.length ? ` cc=${cc.join(',')}` : ''} messageId=${messageId}`,
    );
    return { ok: true, messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ses-email send failed to=${to.join(',')}: ${message}`);
    return { ok: false, code: 'SEND_FAILED', message: 'Failed to send email' };
  }
};
