import type { ScopedAuthUser } from '../database/time-doctor-sql';
import type { LeaveExtraction } from './leave-classify.service';

/** Fired at API Lambda → non-VPC leave-scan worker (Event invoke). */
export type LeaveScanJob = {
  workspaceId: number;
  actor: ScopedAuthUser;
  period?: string;
  maxMessages?: number;
  query?: string;
  lookbackDays: number;
};

export type LeaveScanFetchedMessage = {
  id: string;
  threadId: string;
  from: string | null;
  to: string | null;
  subject: string | null;
  snippet: string | null;
  bodyText: string | null;
  receivedAt: string | null; // ISO
};

export type LeaveScanBatchItem = {
  gmailMessageId: string;
  gmailThreadId: string;
  message?: LeaveScanFetchedMessage | null;
  extraction?: LeaveExtraction | null;
  fetchError?: string | null;
};

/** Worker → API ingest (x-api-key). */
export type LeaveScanIngestBatchRequest = {
  workspaceId: number;
  actor: ScopedAuthUser;
  period: string;
  lookbackDays: number;
  listed: number;
  gmailSubject: string;
  gmailMailbox: string;
  items: LeaveScanBatchItem[];
};
