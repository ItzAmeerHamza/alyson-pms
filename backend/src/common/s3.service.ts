import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  THUMB_CDN_CONFIG_S3_KEY,
  buildThumbCdnUrl,
  isScreenshotThumbKey,
  isThumbCdnConfigured,
} from '../lib/screenshot-thumb-cdn';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client | null;
  private readonly bucket: string | null;
  private readonly prefix: string;
  private readonly defaultTtlSec: number;
  private readonly putTtlSec: number;
  private thumbCdnDomain: string;
  private thumbCdnSecret: string;
  private thumbCdnLoad: Promise<void> | null = null;

  constructor(private readonly config: ConfigService) {
    const region = this.config.get<string>('AWS_REGION');
    const bucket = this.config.get<string>('AWS_S3_SCREENSHOTS_BUCKET');
    this.defaultTtlSec = parseInt(this.config.get<string>('AWS_S3_PRESIGN_TTL_SEC') || '3600', 10);
    this.putTtlSec = parseInt(this.config.get<string>('AWS_S3_PRESIGN_PUT_TTL_SEC') || '300', 10);
    this.prefix = (this.config.get<string>('AWS_S3_SCREENSHOTS_PREFIX') || 'alyson-td-screenshots').replace(
      /^\/+|\/+$/g,
      '',
    );
    this.thumbCdnDomain = (this.config.get<string>('SCREENSHOT_THUMB_CDN_DOMAIN') || '').trim();
    this.thumbCdnSecret = (this.config.get<string>('SCREENSHOT_THUMB_CDN_HMAC_SECRET') || '').trim();

    if (region && bucket) {
      const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
      const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');
      const sessionToken = this.config.get<string>('AWS_SESSION_TOKEN');
      // Local dev uses long-lived AKIA keys. Lambda injects ASIA* STS keys — those require
      // AWS_SESSION_TOKEN in presigned URLs; use the default credential chain instead.
      const useStaticDevCredentials =
        Boolean(accessKeyId?.startsWith('AKIA') && secretAccessKey && !sessionToken);

      this.client = new S3Client({
        region,
        ...(useStaticDevCredentials
          ? { credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! } }
          : {}),
      });
      this.bucket = bucket;
      this.logger.log(`S3 screenshots bucket configured: ${bucket}`);
    } else {
      this.client = null;
      this.bucket = null;
      this.logger.warn(
        'S3 not configured — set AWS_REGION and AWS_S3_SCREENSHOTS_BUCKET in backend/.env',
      );
    }
  }

  isEnabled(): boolean {
    return Boolean(this.client && this.bucket);
  }

  getScreenshotsPrefix(): string {
    return this.prefix;
  }

  async getPresignedPutUrl(
    key: string,
    contentType: string,
    expiresInSec?: number,
  ): Promise<string> {
    if (!this.client || !this.bucket) {
      throw new Error('S3 is not configured');
    }
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: expiresInSec ?? this.putTtlSec,
    });
  }

  async getPresignedGetUrl(key: string, expiresInSec?: number): Promise<string> {
    if (!this.client || !this.bucket) {
      throw new Error('S3 is not configured');
    }
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: expiresInSec ?? this.defaultTtlSec,
    });
  }

  /** Skip placeholder/legacy keys (e.g. bare "key.jpg") that are not real S3 objects. */
  isValidScreenshotObjectKey(key: string | null | undefined): boolean {
    if (!key || typeof key !== 'string') return false;
    const trimmed = key.trim();
    if (trimmed.length < 12) return false;
    if (!trimmed.includes('/')) return false;
    return true;
  }

  async attachPresignedUrls<
    T extends {
      s3_key?: string | null;
      thumb_s3_key?: string | null;
      image_url?: string | null;
      thumb_url?: string | null;
    },
  >(rows: T[], opts?: { originals?: boolean }): Promise<T[]> {
    if (!this.isEnabled()) return rows;
    const originals = opts?.originals !== false;

    return Promise.all(
      rows.map(async (row) => {
        const key = row.s3_key?.trim();
        if (!this.isValidScreenshotObjectKey(key)) {
          if (key) {
            this.logger.warn(`Skipping presign for invalid screenshot s3_key: ${key}`);
          }
          return { ...row, image_url: null, thumb_url: null };
        }
        try {
          const thumbKey = row.thumb_s3_key?.trim();
          let thumbUrl: string | null = null;
          if (this.isValidScreenshotObjectKey(thumbKey)) {
            try {
              thumbUrl = await this.resolveThumbUrl(thumbKey!);
            } catch {
              thumbUrl = null;
            }
          }
          const needOriginal = originals || !thumbUrl;
          const url = needOriginal ? await this.getPresignedGetUrl(key!) : null;
          return { ...row, image_url: url, thumb_url: thumbUrl };
        } catch (err) {
          this.logger.warn(`Presign failed for key ${key}`);
          return { ...row, image_url: null, thumb_url: null };
        }
      }),
    );
  }

  /** Put an arbitrary object (Athena exports, watermarks). Not limited to screenshot keys. */
  async putObject(
    key: string,
    body: string | Buffer,
    contentType: string,
    cacheControl?: string,
  ): Promise<void> {
    if (!this.client || !this.bucket) {
      throw new Error('S3 is not configured');
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ...(cacheControl ? { CacheControl: cacheControl } : {}),
      }),
    );
  }

  private async resolveThumbUrl(thumbKey: string): Promise<string> {
    await this.ensureThumbCdnConfig();
    if (
      isThumbCdnConfigured(this.thumbCdnDomain, this.thumbCdnSecret) &&
      isScreenshotThumbKey(thumbKey)
    ) {
      return buildThumbCdnUrl(this.thumbCdnDomain, thumbKey, this.thumbCdnSecret);
    }
    return this.getPresignedGetUrl(thumbKey);
  }

  private async ensureThumbCdnConfig(): Promise<void> {
    if (isThumbCdnConfigured(this.thumbCdnDomain, this.thumbCdnSecret)) return;
    if (!this.thumbCdnLoad) {
      this.thumbCdnLoad = this.loadThumbCdnConfigFromS3();
    }
    await this.thumbCdnLoad;
  }

  private async loadThumbCdnConfigFromS3(): Promise<void> {
    try {
      const text = await this.getObjectText(THUMB_CDN_CONFIG_S3_KEY, 4096);
      if (!text) return;
      const parsed = JSON.parse(text) as { domain?: unknown; secret?: unknown };
      const domain = typeof parsed.domain === 'string' ? parsed.domain.trim() : '';
      const secret = typeof parsed.secret === 'string' ? parsed.secret.trim() : '';
      if (!isThumbCdnConfigured(domain, secret)) return;
      this.thumbCdnDomain = domain;
      this.thumbCdnSecret = secret;
      this.logger.log(`Screenshot thumb CDN enabled: ${domain}`);
    } catch {
      this.thumbCdnLoad = null;
    }
  }

  /** Read a UTF-8 object body. Returns null on missing key. */
  async getObjectText(key: string, maxBytes = 1 * 1024 * 1024): Promise<string | null> {
    if (!this.client || !this.bucket) {
      throw new Error('S3 is not configured');
    }
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const stream = response.Body;
      if (!stream) return null;
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of stream as AsyncIterable<Uint8Array>) {
        total += chunk.length;
        if (total > maxBytes) {
          throw new Error(`S3 object exceeds maxBytes (${maxBytes})`);
        }
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks).toString('utf8');
    } catch (err: unknown) {
      const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : '';
      const status =
        err && typeof err === 'object' && '$metadata' in err
          ? (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
          : undefined;
      if (name === 'NoSuchKey' || status === 404) return null;
      throw err;
    }
  }

  /** Best-effort delete of a screenshot object. Returns false if S3 is off or key is invalid. */
  async deleteObject(key: string | null | undefined): Promise<boolean> {
    if (!this.client || !this.bucket) return false;
    if (!this.isValidScreenshotObjectKey(key)) return false;
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key!.trim() }));
      return true;
    } catch (err) {
      this.logger.warn(
        `S3 delete failed for key ${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  async getObjectBuffer(key: string, maxBytes = 4 * 1024 * 1024): Promise<{ buffer: Buffer; contentType: string }> {
    if (!this.client || !this.bucket) {
      throw new Error('S3 is not configured');
    }
    if (!this.isValidScreenshotObjectKey(key)) {
      throw new Error('Invalid screenshot S3 key');
    }

    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const response = await this.client.send(command);
    const stream = response.Body;
    if (!stream) {
      throw new Error('Empty S3 object body');
    }

    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      total += chunk.length;
      if (total > maxBytes) {
        throw new Error('Screenshot exceeds maximum size for AI analysis');
      }
      chunks.push(Buffer.from(chunk));
    }

    const buffer = Buffer.concat(chunks);
    const contentType = response.ContentType || 'image/jpeg';
    return { buffer, contentType };
  }
}
