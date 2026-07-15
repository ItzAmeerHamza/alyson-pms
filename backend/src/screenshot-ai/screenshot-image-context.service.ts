import { Injectable, Logger } from '@nestjs/common';
import {
  DetectLabelsCommand,
  DetectTextCommand,
  RekognitionClient,
} from '@aws-sdk/client-rekognition';

export interface ScreenshotImageContext {
  ocrText: string | null;
  labels: string[];
  route: 'rekognition' | 'unavailable';
}

const MAX_OCR_CHARS = 6000;
const MAX_LABELS = 12;

@Injectable()
export class ScreenshotImageContextService {
  private readonly logger = new Logger(ScreenshotImageContextService.name);
  private readonly client: RekognitionClient | null;

  constructor() {
    const region = process.env.AWS_REGION;
    this.client = region ? new RekognitionClient({ region }) : null;
  }

  isConfigured(): boolean {
    return Boolean(this.client);
  }

  /** Extract visible text and scene labels from screenshot bytes (AWS Rekognition). */
  async extractFromImage(buffer: Buffer): Promise<ScreenshotImageContext> {
    if (!this.client || buffer.length === 0) {
      return { ocrText: null, labels: [], route: 'unavailable' };
    }

    try {
      const [textResult, labelResult] = await Promise.all([
        this.client.send(new DetectTextCommand({ Image: { Bytes: buffer } })),
        this.client.send(
          new DetectLabelsCommand({
            Image: { Bytes: buffer },
            MaxLabels: MAX_LABELS,
            MinConfidence: 70,
          }),
        ),
      ]);

      const lines =
        textResult.TextDetections?.filter(
          (d) => d.Type === 'LINE' && d.DetectedText && d.Confidence && d.Confidence >= 80,
        )
          .map((d) => d.DetectedText!.trim())
          .filter(Boolean) ?? [];

      const ocrText = this.dedupeLines(lines).slice(0, MAX_OCR_CHARS) || null;
      const labels =
        labelResult.Labels?.map((l) => l.Name?.trim())
          .filter((name): name is string => Boolean(name))
          .slice(0, MAX_LABELS) ?? [];

      return { ocrText, labels, route: 'rekognition' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Rekognition extract failed: ${message}`);
      return { ocrText: null, labels: [], route: 'unavailable' };
    }
  }

  private dedupeLines(lines: string[]): string {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const line of lines) {
      const key = line.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(line);
      }
    }
    return out.join('\n');
  }
}
