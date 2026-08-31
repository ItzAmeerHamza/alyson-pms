import { S3Service } from '../common/s3.service';

export const THUMB_MAX_WIDTH = 480;
export const THUMB_JPEG_QUALITY = 70;

/** Sibling object: `…/id.jpg` → `…/id.thumb.jpg`. */
export function thumbS3KeyFromOriginal(s3Key: string): string {
  const trimmed = String(s3Key || '').trim();
  const slash = trimmed.lastIndexOf('/');
  const base = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
  const dir = slash >= 0 ? trimmed.slice(0, slash + 1) : '';
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return `${dir}${stem}.thumb.jpg`;
}

export async function createScreenshotThumb(buffer: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp(buffer)
    .rotate()
    .resize({ width: THUMB_MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: THUMB_JPEG_QUALITY })
    .toBuffer();
}

/** Best-effort: never fail the AI/upload path if resize or PutObject fails. */
export async function writeScreenshotThumb(
  s3: S3Service,
  originalKey: string,
  buffer: Buffer,
): Promise<string | null> {
  try {
    const key = thumbS3KeyFromOriginal(originalKey);
    const thumb = await createScreenshotThumb(buffer);
    await s3.putObject(key, thumb, 'image/jpeg', 'public, max-age=86400, immutable');
    return key;
  } catch {
    return null;
  }
}
