/**
 * Build a minimal RFC 2045 multipart MIME message for SES SendEmail Raw.
 */

export type SesMimeAttachment = {
  filename: string;
  contentType: string;
  /** UTF-8 text or binary as Buffer / string */
  content: string | Buffer;
};

function encodeSubject(subject: string): string {
  // ASCII-safe subjects stay plain; otherwise RFC 2047.
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
}

function foldBase64(b64: string): string {
  return b64.replace(/.{1,76}/g, (line) => `${line}\r\n`).trimEnd();
}

/** Full MIME message bytes for SESv2 Content.Raw.Data */
export function buildSesRawMime(input: {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: SesMimeAttachment[];
}): Buffer {
  const boundaryMixed = `mixed_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const boundaryAlt = `alt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const attachments = input.attachments || [];
  const hasAttachments = attachments.length > 0;

  const headers: string[] = [
    `From: ${input.from}`,
    `To: ${input.to.join(', ')}`,
  ];
  if (input.cc?.length) headers.push(`Cc: ${input.cc.join(', ')}`);
  headers.push(
    `Subject: ${encodeSubject(input.subject)}`,
    'MIME-Version: 1.0',
  );

  const textPart = String(input.text || stripHtmlRough(input.html));
  const htmlPart = String(input.html);

  const altBody = [
    `--${boundaryAlt}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    foldBase64(Buffer.from(textPart, 'utf8').toString('base64')),
    `--${boundaryAlt}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    foldBase64(Buffer.from(htmlPart, 'utf8').toString('base64')),
    `--${boundaryAlt}--`,
  ].join('\r\n');

  let body: string;
  if (!hasAttachments) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundaryAlt}"`);
    body = altBody;
  } else {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundaryMixed}"`);
    const parts: string[] = [
      `--${boundaryMixed}`,
      `Content-Type: multipart/alternative; boundary="${boundaryAlt}"`,
      '',
      altBody,
    ];
    for (const att of attachments) {
      const filename = String(att.filename || 'attachment.bin').replace(/[\r\n"]/g, '');
      const contentType = String(att.contentType || 'application/octet-stream');
      const buf = Buffer.isBuffer(att.content)
        ? att.content
        : Buffer.from(String(att.content), 'utf8');
      parts.push(
        `--${boundaryMixed}`,
        `Content-Type: ${contentType}; name="${filename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${filename}"`,
        '',
        foldBase64(buf.toString('base64')),
      );
    }
    parts.push(`--${boundaryMixed}--`);
    body = parts.join('\r\n');
  }

  return Buffer.from(`${headers.join('\r\n')}\r\n\r\n${body}\r\n`, 'utf8');
}

function stripHtmlRough(html: string): string {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
