import { describe, expect, it } from 'vitest';
import {
  ISSUE_CATEGORIES,
  ISSUE_CATEGORY_LABELS,
  buildIssueEmail,
  cleanIssueText,
  parseIssueRecipients,
  redactSecrets,
} from './issue-report';

describe('issue report helpers', () => {
  it('redacts bearer tokens and JWTs', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signaturevalue';
    const cleaned = redactSecrets(`token Bearer abc.def and ${jwt}`);
    expect(cleaned).not.toContain('abc.def');
    expect(cleaned).not.toContain(jwt);
    expect(cleaned).toContain('[redacted]');
  });

  it('trims and caps report text', () => {
    expect(cleanIssueText('  hello\u0000  ', 20)).toBe('hello');
    expect(cleanIssueText('abcdef', 3)).toBe('abc');
  });

  it('keeps only real extra inboxes and stops at 15', () => {
    expect(
      parseIssueRecipients('ops@tavilo.ai, not-an-email, ops@tavilo.ai, a@example.com'),
    ).toEqual(['ops@tavilo.ai']);
    const many = Array.from({ length: 20 }, (_, i) => `ops${i}@tavilo.ai`).join(',');
    expect(parseIssueRecipients(many)).toHaveLength(15);
  });

  it.each(ISSUE_CATEGORIES)('names the %s email from the category label', (category) => {
    const mail = buildIssueEmail({
      category,
      message: 'The timer stopped while I was working on a task.',
      reporterName: 'Asha',
      reporterEmail: 'asha@tavilo.ai',
      appVersion: '1.0.248',
      platform: 'darwin',
      osSummary: 'Darwin 24',
      diagnostics: 'log line',
    });
    expect(mail.subject).toBe(`Tavilo Time issue: ${ISSUE_CATEGORY_LABELS[category]}`);
    expect(mail.text).toContain('log line');
    expect(mail.html).toContain('Diagnostics');
  });

  it('escapes the report in the email body and omits empty diagnostics', () => {
    const mail = buildIssueEmail({
      category: 'tracking',
      message: '<script>alert(1)</script>',
      reporterName: 'Asha\nBcc: evil@example.com',
      reporterEmail: 'asha@tavilo.ai',
      appVersion: '1.0.248',
      platform: 'darwin',
      osSummary: 'Darwin 24',
      diagnostics: null,
    });
    expect(mail.subject).toBe('Tavilo Time issue: Time tracking');
    expect(mail.subject).not.toContain('\n');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).not.toContain('<script>');
    expect(mail.text).toContain('<script>alert(1)</script>');
    expect(mail.html).toContain('No diagnostics were included.');
  });

  it('caps diagnostic text included in the email', () => {
    const mail = buildIssueEmail({
      category: 'other',
      message: 'Something else broke during tracking today.',
      reporterName: 'Asha',
      reporterEmail: 'asha@tavilo.ai',
      appVersion: '1',
      platform: 'win32',
      osSummary: 'Windows',
      diagnostics: 'x'.repeat(6000),
    });
    expect(mail.text.length).toBeLessThan(6000);
    expect(mail.html).not.toContain('x'.repeat(4001));
  });
});
