import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GmailDwdService } from './gmail-dwd.service';
import { LeaveClassifyService } from './leave-classify.service';
import type {
  LeaveScanBatchItem,
  LeaveScanIngestBatchRequest,
  LeaveScanJob,
} from './leave-scan.types';

/**
 * Non-VPC worker: Gmail DWD + DeepSeek, then POST batch to API Lambda (has DB).
 * API Lambda itself has no NAT — this is why scan cannot run in-process in prod.
 */
@Injectable()
export class LeaveScanWorkerService {
  private readonly logger = new Logger(LeaveScanWorkerService.name);
  private readonly apiBaseUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly config: ConfigService,
    private readonly gmail: GmailDwdService,
    private readonly classify: LeaveClassifyService,
  ) {
    this.apiBaseUrl = (
      this.config.get<string>('LEAVE_SCAN_API_BASE_URL') ||
      this.config.get<string>('SCREENSHOT_AI_API_BASE_URL') ||
      ''
    )
      .trim()
      .replace(/\/$/, '');
    this.apiKey = (this.config.get<string>('INTERNAL_API_KEY') || '').trim();
  }

  async run(job: LeaveScanJob): Promise<void> {
    if (!this.apiBaseUrl || !this.apiKey) {
      throw new Error('LEAVE_SCAN_API_BASE_URL and INTERNAL_API_KEY required on leave-scan worker');
    }
    if (!this.gmail.isConfigured()) {
      throw new Error('Google DWD is not configured on leave-scan worker');
    }
    if (!this.classify.isConfigured()) {
      throw new Error('DeepSeek is not configured on leave-scan worker');
    }

    const maxMessages = job.maxMessages || 100;
    const lookbackDays = job.lookbackDays || 30;
    const period = job.period || '30d';

    this.logger.log(
      `Leave scan worker start workspace=${job.workspaceId} period=${period} max=${maxMessages}`,
    );

    const listed = await this.gmail.listMessages({
      query: job.query,
      maxResults: maxMessages,
      lookbackDays,
    });

    const items: LeaveScanBatchItem[] = [];
    for (const item of listed) {
      try {
        const msg = await this.gmail.getMessage(item.id);
        let extraction = null;
        try {
          extraction = await this.classify.classifyEmail({
            from: msg.from,
            to: msg.to,
            subject: msg.subject,
            snippet: msg.snippet,
            bodyText: msg.bodyText,
            receivedAt: msg.receivedAt,
          });
        } catch (err) {
          this.logger.warn(`Leave classify failed for ${msg.id}: ${String(err).slice(0, 200)}`);
          items.push({
            gmailMessageId: msg.id,
            gmailThreadId: msg.threadId,
            message: {
              id: msg.id,
              threadId: msg.threadId,
              from: msg.from,
              to: msg.to,
              subject: msg.subject,
              snippet: msg.snippet,
              bodyText: msg.bodyText ? msg.bodyText.slice(0, 12000) : null,
              receivedAt: msg.receivedAt ? msg.receivedAt.toISOString() : null,
            },
            extraction: null,
            fetchError: null,
          });
          continue;
        }

        items.push({
          gmailMessageId: msg.id,
          gmailThreadId: msg.threadId,
          message: {
            id: msg.id,
            threadId: msg.threadId,
            from: msg.from,
            to: msg.to,
            subject: msg.subject,
            snippet: msg.snippet,
            bodyText: msg.bodyText ? msg.bodyText.slice(0, 12000) : null,
            receivedAt: msg.receivedAt ? msg.receivedAt.toISOString() : null,
          },
          extraction,
          fetchError: null,
        });
      } catch (err) {
        items.push({
          gmailMessageId: item.id,
          gmailThreadId: item.threadId,
          message: null,
          extraction: null,
          fetchError: String(err).slice(0, 300),
        });
      }
    }

    const url = `${this.apiBaseUrl}/pulse/leave/internal/ingest-batch`;
    const chunkSize = 10;
    let lastBody = '';
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize).map((it) => ({
        ...it,
        message: it.message
          ? {
              ...it.message,
              bodyText: it.message.bodyText ? it.message.bodyText.slice(0, 4000) : null,
            }
          : null,
        extraction: it.extraction
          ? {
              ...it.extraction,
              raw: {
                isLeaveRequest: it.extraction.isLeaveRequest,
                confidence: it.extraction.confidence,
                confidencePct: it.extraction.confidencePct,
                warnings: it.extraction.warnings,
              },
            }
          : null,
      }));
      const payload: LeaveScanIngestBatchRequest = {
        workspaceId: job.workspaceId,
        actor: job.actor,
        period,
        lookbackDays,
        listed: listed.length,
        gmailSubject: this.gmail.subjectEmail(),
        gmailMailbox: this.gmail.mailboxFilter(),
        items: chunk,
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      lastBody = text;
      if (!res.ok) {
        this.logger.error(
          `Leave ingest-batch chunk ${i}-${i + chunk.length} failed ${res.status}: ${text.slice(0, 400)}`,
        );
        throw new Error(`Leave ingest-batch failed (${res.status})`);
      }
      this.logger.log(
        `Leave ingest chunk ${i}-${i + chunk.length}/${items.length} ok`,
      );
    }

    this.logger.log(
      `Leave scan worker done listed=${listed.length} items=${items.length} last=${lastBody.slice(0, 200)}`,
    );
  }
}
