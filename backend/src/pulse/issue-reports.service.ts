import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SesEmailService } from '../common/ses-email.service';
import { DatabaseService } from '../database/database.service';
import {
  parseTenantUserId,
  parseWorkspaceId,
  ScopedAuthUser,
} from '../database/time-doctor-sql';
import {
  ISSUE_DIAGNOSTICS_MAX,
  ISSUE_REPORT_HOURLY_LIMIT,
  buildIssueEmail,
  cleanIssueText,
  oneLine,
  parseIssueRecipients,
} from './issue-report';
import { CreateIssueReportDto } from './dto/issue-report.dto';

export type IssueReportUser = ScopedAuthUser & {
  email?: string | null;
  full_name?: string | null;
};

export type IssueReportRow = {
  id: string;
  created_at: string;
  category: string;
  message: string;
  include_diagnostics: boolean;
  diagnostics: string | null;
  app_version: string | null;
  platform: string | null;
  os_summary: string | null;
  reporter_email: string | null;
  reporter_name: string | null;
};

@Injectable()
export class IssueReportsService {
  private readonly logger = new Logger(IssueReportsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly ses: SesEmailService,
    private readonly config: ConfigService,
  ) {}

  async create(
    user: IssueReportUser,
    input: CreateIssueReportDto,
  ): Promise<{ id: string; created_at: string }> {
    const userId = this.requireUserId(user);
    const message = cleanIssueText(input.message, 4000);
    if (message.length < 10) {
      throw new BadRequestException('Describe the issue in at least a few words.');
    }
    const includeDiagnostics = input.include_diagnostics === true;
    const diagnostics = includeDiagnostics
      ? cleanIssueText(input.diagnostics, ISSUE_DIAGNOSTICS_MAX) || null
      : null;
    const workspaceId = await this.resolveWorkspaceId(user, userId);
    await this.assertUnderHourlyLimit(userId);

    let row: { id: string; created_at: Date | string };
    try {
      const inserted = await this.db.query<{ id: string; created_at: Date | string }>(
        `INSERT INTO time_doctor.issue_reports (
           user_id, workspace_id, category, message, include_diagnostics, diagnostics,
           app_version, platform, os_summary, reporter_email, reporter_name
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id::text AS id, created_at`,
        [
          userId,
          workspaceId,
          input.category,
          message,
          includeDiagnostics && Boolean(diagnostics),
          diagnostics,
          oneLine(input.app_version, 40) || null,
          oneLine(input.platform, 32) || null,
          oneLine(input.os_summary, 160) || null,
          oneLine(user.email, 200) || null,
          oneLine(user.full_name, 120) || null,
        ],
      );
      const created = inserted.rows[0];
      if (!created?.id) {
        throw new Error('insert returned no row');
      }
      row = created;
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof HttpException) throw err;
      this.logger.error(`issue report insert failed: ${this.errorText(err)}`);
      throw new InternalServerErrorException('Could not send the report right now.');
    }

    const createdAt =
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
    try {
      await this.notify({
        id: row.id,
        workspaceId,
        category: input.category,
        message,
        diagnostics,
        appVersion: oneLine(input.app_version, 40),
        platform: oneLine(input.platform, 32),
        osSummary: oneLine(input.os_summary, 160),
        reporterEmail: oneLine(user.email, 200),
        reporterName: oneLine(user.full_name, 120),
      });
    } catch (err) {
      this.logger.warn(`issue report ${row.id} email skipped: ${this.errorText(err)}`);
    }

    return { id: row.id, created_at: createdAt };
  }

  async list(workspaceId: number, limit = 50): Promise<IssueReportRow[]> {
    const capped = Math.min(200, Math.max(1, Math.floor(limit) || 50));
    try {
      const result = await this.db.query<IssueReportRow>(
        `SELECT id::text AS id,
                created_at::text AS created_at,
                category,
                message,
                include_diagnostics,
                diagnostics,
                app_version,
                platform,
                os_summary,
                reporter_email,
                reporter_name
         FROM time_doctor.issue_reports
         WHERE workspace_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [workspaceId, capped],
      );
      return result.rows;
    } catch (err) {
      this.logger.error(`issue report list failed: ${this.errorText(err)}`);
      throw new InternalServerErrorException('Could not load issue reports.');
    }
  }

  private requireUserId(user: IssueReportUser): number {
    try {
      return parseTenantUserId(user.id);
    } catch {
      throw new BadRequestException('Please sign in again.');
    }
  }

  private async resolveWorkspaceId(user: IssueReportUser, userId: number): Promise<number | null> {
    const fromAuth = parseWorkspaceId(user.organization_id);
    if (fromAuth) return fromAuth;
    try {
      const result = await this.db.query<{ organization_id: string | null }>(
        `SELECT ext.workspace_id::text AS organization_id
         FROM time_doctor.user_extensions ext
         WHERE ext.user_id = $1
         LIMIT 1`,
        [userId],
      );
      return parseWorkspaceId(result.rows[0]?.organization_id);
    } catch (err) {
      this.logger.warn(`issue report workspace lookup skipped: ${this.errorText(err)}`);
      return null;
    }
  }

  private async assertUnderHourlyLimit(userId: number): Promise<void> {
    try {
      const result = await this.db.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n
         FROM time_doctor.issue_reports
         WHERE user_id = $1
           AND created_at > NOW() - INTERVAL '1 hour'`,
        [userId],
      );
      const count = parseInt(result.rows[0]?.n || '0', 10);
      if (count >= ISSUE_REPORT_HOURLY_LIMIT) {
        throw new HttpException(
          'You have sent several reports recently. Try again in a little while.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`issue report rate check failed: ${this.errorText(err)}`);
      throw new InternalServerErrorException('Could not send the report right now.');
    }
  }

  private async notify(input: {
    id: string;
    workspaceId: number | null;
    category: string;
    message: string;
    diagnostics: string | null;
    appVersion: string;
    platform: string;
    osSummary: string;
    reporterEmail: string;
    reporterName: string;
  }): Promise<void> {
    const recipients = await this.recipientEmails(input.workspaceId);
    if (!recipients.length) {
      this.logger.log(`issue report ${input.id} stored with no email recipients`);
      return;
    }
    const mail = buildIssueEmail({
      category: input.category,
      message: input.message,
      reporterName: input.reporterName,
      reporterEmail: input.reporterEmail,
      appVersion: input.appVersion,
      platform: input.platform,
      osSummary: input.osSummary,
      diagnostics: input.diagnostics,
    });
    await this.ses.send({
      to: recipients,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
  }

  private async recipientEmails(workspaceId: number | null): Promise<string[]> {
    const extras = parseIssueRecipients(this.config.get<string>('ISSUE_REPORT_TO'));
    let admins: string[] = [];
    if (workspaceId) {
      try {
        const result = await this.db.query<{ email: string }>(
          `SELECT DISTINCT lower(u.email) AS email
           FROM tenant."user" u
           JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
           WHERE ext.workspace_id = $1
             AND ext.pulse_role = 'admin'
             AND COALESCE(u.email, '') <> ''
           LIMIT 20`,
          [workspaceId],
        );
        admins = parseIssueRecipients(result.rows.map((row) => row.email).join(','));
      } catch (err) {
        this.logger.warn(`issue report admin lookup skipped: ${this.errorText(err)}`);
      }
    }
    return [...new Set([...admins, ...extras])].slice(0, 15);
  }

  private errorText(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
