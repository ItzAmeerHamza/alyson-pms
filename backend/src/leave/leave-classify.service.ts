import { Injectable, Logger } from '@nestjs/common';
import { LlmChatClient } from '../screenshot-ai/llm-chat.client';
import {
  extractLeaveDateKeysFromText,
  isLeaveType,
  leaveDaysInclusive,
  LeaveType,
  parseLeaveDateKey,
} from './leave-days';

/**
 * Alyson HR leave intake prompt — conservative false positives.
 * Dates are company work-calendar YYYY-MM-DD (Pulse uses workspace TZ, not IST).
 * `days` = weekday count used to credit timeline hours (7h × days).
 */
const LEAVE_EXTRACT_PROMPT = `You are Alyson HR leave intake. Parse ONE email to People Ops and return ONLY valid JSON.

Schema:
{
  "isLeaveRequest": true,
  "isPublicHoliday": false,
  "country": "India|Pakistan|null",
  "office": "Pune|Karachi|null",
  "confidence": 0.0,
  "employee": {
    "name": "string",
    "email": "string|null",
    "matchedFrom": "from_header|body_signature|manager_on_behalf|unknown"
  },
  "leave": {
    "leaveType": "annual|sick|personal|unpaid|other",
    "startDate": "YYYY-MM-DD|null",
    "endDate": "YYYY-MM-DD|null",
    "days": null,
    "reason": "string|null",
    "halfDay": false,
    "isCancellation": false,
    "cancelsEventId": null
  },
  "tone": { "label": "formal|casual|urgent|apologetic|neutral", "summary": "one line" },
  "warnings": ["string"],
  "rawSummary": "string"
}

Rules:
- ALWAYS set leave.days to the weekday count (Mon–Fri) for the leave. Exclude Sat/Sun. Examples: Aug 12–12 → days=1; Fri Aug 7 – Mon Aug 10 → days=2.
- days is used to credit timeline hours (typically 7h × days) so the employee is not penalized for approved leave.
- If the email lists specific weekdays only (e.g. 7th and 10th), set startDate/endDate to earliest/latest and days to how many weekdays were requested.
- half day → days=0.5, halfDay=true, startDate=endDate on that weekday.
- leaveType: annual (vacation/PTO/casual when balance mentioned), sick, personal, unpaid, other.
- isPublicHoliday=true when the email announces a public holiday, festival, or office closure for a site/country (e.g. "Pune Office Closed for Janmashtami - 4th September, 2026"). Set country and/or office. startDate/endDate MUST be the closed day(s) as YYYY-MM-DD, NEVER the email sent/received date. These notices are often mailed 3–4 days ahead.
- isLeaveRequest=false for FYI, meeting invites, payroll/benefits, recruitment/hiring threads, interview pipelines, newsletters, pure WFH with no leave, and other non-leave mail. Use low confidence. Office-closed / public-holiday notices use isPublicHoliday=true and isLeaveRequest=false.
- isLeaveRequest=true only when the email requests, confirms, or cancels employee time off / leave / OOO absence.
- isCancellation=true if user cancels or withdraws previously requested leave.
- Extract employee email from From: when possible; if a manager writes for someone else, set matchedFrom=manager_on_behalf and extract the employee from the body.
- reason: short leave reason from the email (travel, legal matter, etc.).
- rawSummary: one-line HR summary (who, dates, why).
- confidence 0–1: lower if dates ambiguous, missing year, unclear leave vs WFH, or borderline non-leave.
- warnings: list every ambiguity; never hide uncertainty.
- Do not fabricate emails or dates not supported by the email text.
- Output JSON only, no markdown.`;

export type LeaveMatchedFrom =
  | 'from_header'
  | 'body_signature'
  | 'manager_on_behalf'
  | 'unknown';

export type LeaveExtraction = {
  isLeaveRequest: boolean;
  isPublicHoliday: boolean;
  country: string | null;
  office: string | null;
  confidence: number; // 0–1
  confidencePct: number; // 0–100 for UI
  employee: {
    name: string | null;
    email: string | null;
    emails: string[];
    matchedFrom: LeaveMatchedFrom;
  };
  leave: {
    leaveType: LeaveType;
    startDate: string | null;
    endDate: string | null;
    days: number | null;
    reason: string | null;
    halfDay: boolean;
    isCancellation: boolean;
  };
  warnings: string[];
  rawSummary: string | null;
  raw: Record<string, unknown>;
};

@Injectable()
export class LeaveClassifyService {
  private readonly logger = new Logger(LeaveClassifyService.name);

  constructor(private readonly deepseek: LlmChatClient) {}

  isConfigured(): boolean {
    return this.deepseek.isConfigured();
  }

  async classifyEmail(input: {
    from: string | null;
    to: string | null;
    subject: string | null;
    snippet: string | null;
    bodyText: string | null;
    receivedAt?: Date | string | null;
  }): Promise<LeaveExtraction> {
    if (!this.deepseek.isConfigured()) {
      throw new Error('LLM is not configured');
    }

    const receivedIso = input.receivedAt
      ? new Date(input.receivedAt).toISOString()
      : null;
    const receivedDay = receivedIso ? receivedIso.slice(0, 10) : null;

    const userContent = [
      'Parse this People Ops email for leave intake.',
      `Email received at (UTC): ${receivedIso || '(unknown)'}`,
      receivedDay
        ? `If this is a PERSONAL leave request that says "today" with no calendar date, use ${receivedDay}. If this is a holiday / office-closed notice (often sent 3–4 days ahead), use the closed day in the email, not ${receivedDay}.`
        : null,
      `From: ${input.from || '(unknown)'}`,
      `To: ${input.to || '(unknown)'}`,
      `Subject: ${input.subject || '(none)'}`,
      `Snippet: ${input.snippet || ''}`,
      'Body:',
      '---',
      (input.bodyText || input.snippet || '').slice(0, 12000),
      '---',
    ]
      .filter(Boolean)
      .join('\n');

    const { parsed } = await this.deepseek.chatJson({
      systemPrompt: LEAVE_EXTRACT_PROMPT,
      userContent,
      maxTokens: 900,
      temperature: 0.1,
    });

    return this.normalize(parsed, input.from, receivedDay, {
      subject: input.subject,
      snippet: input.snippet,
      bodyText: input.bodyText,
    });
  }

  private normalize(
    raw: Record<string, unknown>,
    fromHeader: string | null,
    fallbackDate?: string | null,
    source?: { subject?: string | null; snippet?: string | null; bodyText?: string | null },
  ): LeaveExtraction {
    const empObj =
      raw.employee && typeof raw.employee === 'object'
        ? (raw.employee as Record<string, unknown>)
        : {};
    const leaveObj =
      raw.leave && typeof raw.leave === 'object'
        ? (raw.leave as Record<string, unknown>)
        : {};

    // Legacy shape support (is_leave / employee_emails)
    const legacyEmails = Array.isArray(raw.employee_emails)
      ? raw.employee_emails.map((e) => String(e).trim().toLowerCase()).filter(Boolean)
      : [];

    const emailFromEmp = empObj.email ? String(empObj.email).trim().toLowerCase() : null;
    const fromParsed = this.extractEmail(fromHeader);
    const emails = Array.from(
      new Set([emailFromEmp, fromParsed, ...legacyEmails].filter(Boolean) as string[]),
    );

    const matchedFromRaw = String(empObj.matchedFrom || 'unknown');
    const matchedFrom: LeaveMatchedFrom = (
      ['from_header', 'body_signature', 'manager_on_behalf', 'unknown'] as const
    ).includes(matchedFromRaw as LeaveMatchedFrom)
      ? (matchedFromRaw as LeaveMatchedFrom)
      : fromParsed
        ? 'from_header'
        : 'unknown';

    const leaveTypeRaw = leaveObj.leaveType ?? leaveObj.type ?? raw.leave_type;
    const leaveType = this.normalizeLeaveType(leaveTypeRaw);
    const isPublicHoliday = Boolean(raw.isPublicHoliday ?? raw.is_public_holiday);
    const yearHint = fallbackDate ? Number(String(fallbackDate).slice(0, 4)) : undefined;
    const dateBlob = [
      leaveObj.startDate,
      leaveObj.endDate,
      raw.start_date,
      raw.end_date,
      source?.subject,
      source?.snippet,
      source?.bodyText,
      raw.rawSummary,
    ]
      .filter(Boolean)
      .join(' ');
    let start =
      parseLeaveDateKey(leaveObj.startDate, { yearHint }) ||
      parseLeaveDateKey(raw.start_date, { yearHint });
    let end =
      parseLeaveDateKey(leaveObj.endDate, { yearHint }) ||
      parseLeaveDateKey(raw.end_date, { yearHint }) ||
      start;
    if (!start) {
      const fromCopy = extractLeaveDateKeysFromText(dateBlob, { yearHint });
      start = fromCopy[0] || null;
      end = fromCopy.length > 1 ? fromCopy[fromCopy.length - 1] : fromCopy[0] || null;
    }

    // Personal leave "today" → received day. Never use sent date for holiday notices.
    if ((!start || !end) && fallbackDate && !isPublicHoliday) {
      start = start || fallbackDate;
      end = end || start;
    }

    const halfDay = Boolean(leaveObj.halfDay) || Number(leaveObj.days) === 0.5;
    if (halfDay && start) {
      end = start;
    }
    if (end && start && end < start) end = start;

    // Prefer weekday math from dates (same as leave_events / timeline credits).
    // Allow AI days when smaller (sparse listed weekdays) and still positive.
    let days: number | null = null;
    const aiDays =
      leaveObj.days != null && Number.isFinite(Number(leaveObj.days))
        ? Number(leaveObj.days)
        : null;
    if (halfDay && start) {
      days = 0.5;
    } else if (start && end) {
      const computed = leaveDaysInclusive(start, end);
      if (computed > 0) {
        if (aiDays != null && aiDays > 0 && aiDays < 1) days = 0.5;
        else if (aiDays != null && aiDays > 0 && aiDays <= computed) days = aiDays;
        else days = computed;
      }
    } else if (aiDays != null && aiDays > 0) {
      days = aiDays > 0 && aiDays < 1 ? 0.5 : aiDays;
    }

    const confidence01 = this.normalizeConfidence01(raw.confidence ?? leaveObj.confidence);
    const isLeaveRequest = Boolean(
      raw.isLeaveRequest ?? raw.is_leave,
    );
    const country =
      raw.country != null && String(raw.country).trim()
        ? String(raw.country).trim()
        : null;
    const office =
      raw.office != null && String(raw.office).trim()
        ? String(raw.office).trim()
        : leaveObj.office != null
          ? String(leaveObj.office).trim()
          : null;

    const warnings = Array.isArray(raw.warnings)
      ? raw.warnings.map((w) => String(w).slice(0, 200))
      : [];

    return {
      isLeaveRequest,
      isPublicHoliday,
      country,
      office,
      confidence: confidence01,
      confidencePct: Math.round(confidence01 * 100),
      employee: {
        name:
          (empObj.name ? String(empObj.name).trim() : null) ||
          (Array.isArray(raw.employee_names) && raw.employee_names[0]
            ? String(raw.employee_names[0]).trim()
            : null),
        email: emailFromEmp || fromParsed,
        emails,
        matchedFrom,
      },
      leave: {
        leaveType,
        startDate: start,
        endDate: end,
        days,
        reason:
          (leaveObj.reason ? String(leaveObj.reason).slice(0, 500) : null) ||
          (raw.note ? String(raw.note).slice(0, 500) : null),
        halfDay: halfDay || days === 0.5,
        isCancellation: Boolean(leaveObj.isCancellation),
      },
      warnings,
      rawSummary: raw.rawSummary ? String(raw.rawSummary).slice(0, 800) : null,
      raw,
    };
  }

  private normalizeLeaveType(value: unknown): LeaveType {
    if (isLeaveType(value)) return value;
    const s = String(value || '')
      .trim()
      .toLowerCase();
    if (!s) return 'other';
    if (s.includes('sick')) return 'sick';
    if (s.includes('annual') || s.includes('pto') || s.includes('vacation')) return 'annual';
    if (s.includes('personal')) return 'personal';
    if (s.includes('unpaid')) return 'unpaid';
    return 'other';
  }

  private extractEmail(header: string | null): string | null {
    if (!header) return null;
    const m = header.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return m ? m[0].toLowerCase() : null;
  }

  /** Accept 0–1 or 0–100. */
  private normalizeConfidence01(value: unknown): number {
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    if (!Number.isFinite(n)) return 0.5;
    if (n > 1) return Math.max(0, Math.min(1, n / 100));
    return Math.max(0, Math.min(1, n));
  }
}
