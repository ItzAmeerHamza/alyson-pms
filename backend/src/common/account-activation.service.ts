import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { buildActivationEmail } from './activation-email-templates';
import { SesEmailService } from './ses-email.service';

/** First sign-in must stay fast; SES normally answers well inside this. */
const SEND_TIMEOUT_MS = 4000;

/**
 * Invited → Active. `signed_in_at` is stamped on a user's first successful sign-in
 * (which only happens after they set their permanent password), and that single
 * transition sends the "account activated" email with the installer links.
 */
@Injectable()
export class AccountActivationService {
  private readonly logger = new Logger(AccountActivationService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly sesEmail: SesEmailService,
  ) {}

  /**
   * Stamps `signed_in_at` if it is still empty. The UPDATE is the lock: only the
   * request that flips NULL → now gets a row back, so concurrent sign-ins (web +
   * desktop) cannot double-send. Never throws — sign-in must not depend on email.
   *
   * @returns true when this call activated the account.
   */
  async recordFirstSignIn(userId: number): Promise<boolean> {
    let activated: { email: string | null; first_name: string | null } | undefined;
    try {
      const result = await this.db.query<{ email: string | null; first_name: string | null }>(
        `WITH activated AS (
           UPDATE time_doctor.user_extensions
           SET signed_in_at = NOW(),
               updated_at = NOW()
           WHERE user_id = $1
             AND signed_in_at IS NULL
           RETURNING user_id
         )
         SELECT u.email, u.first_name
         FROM activated a
         JOIN tenant."user" u ON u.id = a.user_id`,
        [userId],
      );
      activated = result.rows[0];
    } catch (error) {
      this.logger.warn(
        `signed_in_at stamp skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }

    if (!activated) return false;

    this.logger.log(`User ${userId} activated (first sign-in)`);
    await this.sendActivationEmail(userId, activated);
    return true;
  }

  private async sendActivationEmail(
    userId: number,
    user: { email: string | null; first_name: string | null },
  ): Promise<void> {
    const email = String(user.email || '').trim().toLowerCase();
    if (!email) {
      this.logger.warn(`Activation email skipped for user ${userId}: no email on file`);
      return;
    }
    if (String(this.config.get<string>('ACTIVATION_EMAIL_ENABLED') ?? '').trim().toLowerCase() === 'false') {
      this.logger.log(`Activation email disabled by ACTIVATION_EMAIL_ENABLED (user ${userId})`);
      return;
    }
    if (!this.sesEmail.isEnabled()) {
      this.logger.warn(`Activation email not sent for user ${userId}: SES is not configured`);
      return;
    }

    let timer: NodeJS.Timeout | undefined;
    try {
      const mail = buildActivationEmail({
        firstName: user.first_name,
        appUrl: this.config.get<string>('PULSE_APP_URL'),
        desktopVersion: this.config.get<string>('DESKTOP_DOWNLOAD_VERSION'),
      });
      const result = await Promise.race([
        this.sesEmail.send({
          to: email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        }),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), SEND_TIMEOUT_MS);
        }),
      ]);
      if (result === null) {
        this.logger.warn(`Activation email for user ${userId} still sending after ${SEND_TIMEOUT_MS}ms`);
      } else if (!result.ok) {
        this.logger.error(
          `Activation email failed for user ${userId}: ${result.code || 'unknown'}`,
        );
      } else {
        this.logger.log(`Activation email sent for user ${userId}`);
      }
    } catch (error) {
      this.logger.error(
        `Activation email failed for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
