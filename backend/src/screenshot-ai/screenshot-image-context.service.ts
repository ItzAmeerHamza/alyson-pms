import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ocrWithTesseract } from './tesseract-ocr';

export type ScreenshotOcrProvider = 'tesseract' | 'none';
export type ScreenshotOcrRoute = 'tesseract' | 'unavailable';

export interface ScreenshotImageContext {
  ocrText: string | null;
  labels: string[];
  route: ScreenshotOcrRoute;
}

export function parseOcrProvider(raw: string | undefined): ScreenshotOcrProvider {
  const value = String(raw || 'tesseract').trim().toLowerCase();
  if (value === 'none') {
    return 'none';
  }
  return 'tesseract';
}

@Injectable()
export class ScreenshotImageContextService {
  private readonly logger = new Logger(ScreenshotImageContextService.name);
  private readonly provider: ScreenshotOcrProvider;

  constructor(config: ConfigService) {
    this.provider = parseOcrProvider(config.get<string>('SCREENSHOT_OCR_PROVIDER'));
  }

  isConfigured(): boolean {
    return true;
  }

  async extractFromImage(buffer: Buffer): Promise<ScreenshotImageContext> {
    if (buffer.length === 0 || this.provider === 'none') {
      return { ocrText: null, labels: [], route: 'unavailable' };
    }

    try {
      const ocrText = (await ocrWithTesseract(buffer)) || null;
      return { ocrText, labels: [], route: ocrText ? 'tesseract' : 'unavailable' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Tesseract OCR failed: ${message}`);
      return { ocrText: null, labels: [], route: 'unavailable' };
    }
  }
}
