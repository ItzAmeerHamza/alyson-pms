import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SesEmailEvent, SesEmailResult } from '../lambda/ses-email-handler';

/**
 * Sends transactional email.
 *
 * - VPC Lambda: invokes non-VPC SES_EMAIL_FUNCTION_NAME via LAMBDA_VPC_ENDPOINT_URL
 *   (PrivateDnsEnabled=false). No SES VPC endpoint / no VPC changes.
 * - Local: calls SES directly when the worker name is not set.
 */
@Injectable()
export class SesEmailService {
  private readonly logger = new Logger(SesEmailService.name);
  private readonly lambdaClient: LambdaClient | null = null;
  private readonly sesClient: SESv2Client | null = null;
  private readonly emailFunctionName: string;
  private readonly emailFrom: string;
  private readonly allowedSenders: string[];
  private readonly enabled: boolean;

  constructor(config: ConfigService) {
    const region =
      config.get<string>('SES_REGION') ||
      config.get<string>('AWS_REGION') ||
      'us-west-2';
    this.emailFunctionName = (config.get<string>('SES_EMAIL_FUNCTION_NAME') || '').trim();
    this.emailFrom = (
      (config.get<string>('EMAIL_FROM') || '').trim() || 'hamza@cintara.ai'
    ).toLowerCase();
    const sendersRaw =
      (config.get<string>('EMAIL_SENDERS') || '').trim() ||
      'hamza@cintara.ai,mohita@cintara.ai';
    const parsed = sendersRaw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    this.allowedSenders = parsed.includes(this.emailFrom)
      ? parsed
      : [this.emailFrom, ...parsed];

    const accessKeyId = config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('AWS_SECRET_ACCESS_KEY');
    const useStaticDevCredentials = Boolean(
      accessKeyId?.startsWith('AKIA') &&
        secretAccessKey &&
        !config.get<string>('AWS_SESSION_TOKEN'),
    );
    const staticCreds = useStaticDevCredentials
      ? { credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! } }
      : {};

    if (this.emailFunctionName) {
      const lambdaEndpoint = (config.get<string>('LAMBDA_VPC_ENDPOINT_URL') || '').trim();
      if (lambdaEndpoint) {
        this.logger.log(
          `SES email via Lambda ${this.emailFunctionName} (VPC endpoint, Private DNS off)`,
        );
      } else {
        this.logger.log(`SES email via Lambda ${this.emailFunctionName} (public Lambda API)`);
      }
      this.lambdaClient = new LambdaClient({
        region,
        ...(lambdaEndpoint ? { endpoint: lambdaEndpoint } : {}),
        ...staticCreds,
      });
      this.enabled = true;
      return;
    }

    this.logger.log('SES email using direct SES API (local / public path)');
    this.sesClient = new SESv2Client({ region, ...staticCreds });
    this.enabled = true;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getFromAddress(): string {
    return this.emailFrom;
  }

  getAllowedSenders(): { senders: string[]; default: string } {
    return { senders: [...this.allowedSenders], default: this.emailFrom };
  }

  /** Only allowlisted verified SES identities may be used as From. */
  resolveFrom(requested?: string | null): string {
    const req = String(requested || '')
      .trim()
      .toLowerCase();
    if (req && this.allowedSenders.includes(req)) return req;
    return this.emailFrom;
  }

  async send(input: {
    to: string | string[];
    cc?: string | string[];
    subject: string;
    html: string;
    text?: string;
    from?: string;
  }): Promise<SesEmailResult> {
    const to = (Array.isArray(input.to) ? input.to : [input.to])
      .map((addr) => String(addr || '').trim().toLowerCase())
      .filter(Boolean);
    const toSet = new Set(to);
    const cc = (Array.isArray(input.cc) ? input.cc : input.cc ? [input.cc] : [])
      .map((addr) => String(addr || '').trim().toLowerCase())
      .filter((addr) => addr && !toSet.has(addr));
    const subject = String(input.subject || '').trim();
    const html = String(input.html || '').trim();
    const from = this.resolveFrom(input.from);

    if (!to.length || !subject || !html || !from) {
      return {
        ok: false,
        code: 'ERROR',
        message: 'from, to, subject, and html are required',
      };
    }

    if (this.lambdaClient && this.emailFunctionName) {
      return this.invokeWorker({
        action: 'send',
        to,
        ...(cc.length ? { cc } : {}),
        subject,
        html,
        text: input.text,
        from,
      });
    }

    if (!this.sesClient) {
      return { ok: false, code: 'DISABLED', message: 'SES email is not configured' };
    }

    try {
      const result = await this.sesClient.send(
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
                ...(input.text
                  ? { Text: { Data: String(input.text), Charset: 'UTF-8' } }
                  : {}),
              },
            },
          },
        }),
      );
      return { ok: true, messageId: result.MessageId || '' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`SES send failed: ${message}`);
      return { ok: false, code: 'SEND_FAILED', message: 'Failed to send email' };
    }
  }

  private async invokeWorker(event: SesEmailEvent): Promise<SesEmailResult> {
    try {
      const response = await this.lambdaClient!.send(
        new InvokeCommand({
          FunctionName: this.emailFunctionName,
          Payload: Buffer.from(JSON.stringify(event)),
        }),
      );
      if (response.FunctionError) {
        this.logger.error(
          `SES email worker error: ${response.FunctionError} ${Buffer.from(
            response.Payload || [],
          ).toString()}`,
        );
        return { ok: false, code: 'WORKER_ERROR', message: 'Email worker failed' };
      }
      const raw = Buffer.from(response.Payload || []).toString();
      const parsed = JSON.parse(raw || '{}') as SesEmailResult;
      return parsed;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`SES email invoke failed: ${message}`);
      return { ok: false, code: 'INVOKE_FAILED', message: 'Failed to invoke email worker' };
    }
  }
}
