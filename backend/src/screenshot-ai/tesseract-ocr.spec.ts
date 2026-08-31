import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { execFileSync } from 'child_process';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import {
  OCR_MAX_WIDTH,
  imageExtension,
  normalizeOcrText,
  ocrWithTesseract,
  prepareOcrBuffer,
  resolveTesseractBin,
} from './tesseract-ocr';
import { ScreenshotImageContextService } from './screenshot-image-context.service';

const FIXTURE_DIR = join(__dirname, '__fixtures__');
const FIXTURE_PNG = join(FIXTURE_DIR, 'ocr-fixture.png');
const RENDER_SWIFT = join(FIXTURE_DIR, 'render-ocr-fixture.swift');

function tesseractAvailable(): boolean {
  try {
    const bin = resolveTesseractBin();
    if (!bin) return false;
    execFileSync(bin, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function ensureFixture(): void {
  if (existsSync(FIXTURE_PNG)) return;
  execFileSync('swift', [RENDER_SWIFT, FIXTURE_PNG], { stdio: 'inherit' });
}

describe('normalizeOcrText', () => {
  it('drops blanks and case-insensitive duplicates', () => {
    expect(normalizeOcrText('  Slack  \n\nslack\nCursor\n')).toBe('Slack\nCursor');
  });

  it('caps length', () => {
    expect(normalizeOcrText('abcdef', 4)).toBe('abcd');
  });
});

describe('prepareOcrBuffer', () => {
  it('downscales wide images to a grayscale JPEG', async () => {
    const sharp = (await import('sharp')).default;
    const wide = await sharp({
      create: { width: 3200, height: 400, channels: 3, background: '#ffffff' },
    })
      .jpeg()
      .toBuffer();
    const prepared = await prepareOcrBuffer(wide);
    const meta = await sharp(prepared).metadata();
    expect(meta.width).toBe(OCR_MAX_WIDTH);
    expect(meta.format).toBe('jpeg');
    expect(prepared.length).toBeLessThan(wide.length);
  });

  it('does not enlarge a smaller fixture', async () => {
    ensureFixture();
    const sharp = (await import('sharp')).default;
    const source = await readFile(FIXTURE_PNG);
    const srcMeta = await sharp(source).metadata();
    const prepared = await prepareOcrBuffer(source);
    const outMeta = await sharp(prepared).metadata();
    expect(outMeta.width).toBeLessThanOrEqual(Math.min(srcMeta.width || 0, OCR_MAX_WIDTH));
    expect(prepared.length).toBeGreaterThan(200);
  });
});

describe('imageExtension', () => {
  it('detects jpeg and png magic bytes', () => {
    expect(imageExtension(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe('jpg');
    expect(imageExtension(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      'png',
    );
    expect(imageExtension(Buffer.from([0x00, 0x01]))).toBe('jpg');
  });
});

describe('ScreenshotImageContextService providers', () => {
  it('none provider skips OCR', async () => {
    const service = new ScreenshotImageContextService(
      new ConfigService({ SCREENSHOT_OCR_PROVIDER: 'none' }),
    );
    const ctx = await service.extractFromImage(Buffer.from([0xff, 0xd8, 0xff]));
    expect(ctx).toEqual({ ocrText: null, labels: [], route: 'unavailable' });
  });
});

describe('Tesseract.js Lambda path', () => {
  it('reads known words after downscale (same path as the worker image)', async () => {
    ensureFixture();
    const buffer = await readFile(FIXTURE_PNG);
    const prepared = await prepareOcrBuffer(buffer);
    const { createWorker, OEM, PSM } = await import('tesseract.js');
    const worker = await createWorker('eng', OEM.LSTM_ONLY, { logger: () => undefined });
    try {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      const { data } = await worker.recognize(prepared);
      const lower = (data.text || '').toLowerCase();
      expect(lower).toMatch(/alyson/);
      expect(lower).toMatch(/pulse|ocr/);
      expect(lower).toMatch(/cursor|typescript|ide/);
    } finally {
      await worker.terminate();
    }
  }, 90_000);
});

describe.skipIf(!tesseractAvailable())('Tesseract OCR live', () => {
  it('reads known words from a rendered screenshot', async () => {
    ensureFixture();
    const buffer = await readFile(FIXTURE_PNG);
    const text = await ocrWithTesseract(buffer);
    const lower = text.toLowerCase();
    expect(lower).toMatch(/alyson/);
    expect(lower).toMatch(/pulse|ocr/);
    expect(lower).toMatch(/cursor|typescript|ide/);
  }, 30_000);

  it('ScreenshotImageContextService uses tesseract route', async () => {
    ensureFixture();
    const buffer = await readFile(FIXTURE_PNG);
    const service = new ScreenshotImageContextService(
      new ConfigService({ SCREENSHOT_OCR_PROVIDER: 'tesseract' }),
    );
    const ctx = await service.extractFromImage(buffer);
    expect(ctx.route).toBe('tesseract');
    expect(ctx.labels).toEqual([]);
    expect(ctx.ocrText?.toLowerCase()).toMatch(/alyson/);
  }, 30_000);
});
