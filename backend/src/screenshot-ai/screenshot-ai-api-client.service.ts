import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ScreenshotAiClaimResponse {
  claimed: boolean;
  aiRetryCount?: number;
}

export interface ScreenshotAiCompletePayload {
  screenshotId: string;
  source: string;
  ai_model_used: string;
  activity_type: string;
  category: string;
  is_work_related: boolean;
  confidence_score: number;
  distraction_score: number;
  vision_summary: string;
  vision_analysis: Record<string, unknown>;
  thumb_s3_key?: string | null;
}

@Injectable()
export class ScreenshotAiApiClientService {
  private readonly logger = new Logger(ScreenshotAiApiClientService.name);
  private readonly baseUrl: string | null;
  private readonly apiKey: string | null;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (this.config.get<string>('SCREENSHOT_AI_API_BASE_URL') || '').replace(/\/$/, '') || null;
    this.apiKey = this.config.get<string>('INTERNAL_API_KEY') ?? null;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  async claimProcessing(screenshotId: string): Promise<ScreenshotAiClaimResponse> {
    return this.post<ScreenshotAiClaimResponse>('sync/screenshot-ai/claim', { screenshotId });
  }

  async markCompleted(payload: ScreenshotAiCompletePayload): Promise<void> {
    await this.post('sync/screenshot-ai/complete', payload);
  }

  async markFailed(screenshotId: string, errorMessage: string): Promise<{ retry: boolean }> {
    return this.post<{ retry: boolean }>('sync/screenshot-ai/fail', { screenshotId, errorMessage });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    if (!this.baseUrl || !this.apiKey) {
      throw new Error('SCREENSHOT_AI_API_BASE_URL and INTERNAL_API_KEY must be configured');
    }

    const url = `${this.baseUrl}/${path.replace(/^\//, '')}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let data: T | { message?: string } = {} as T;
    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = { message: text } as { message?: string };
      }
    }

    if (!response.ok) {
      const message =
        typeof data === 'object' && data && 'message' in data && data.message
          ? String(data.message)
          : `API ${response.status}`;
      this.logger.error(`Screenshot AI API ${path} failed: ${message}`);
      throw new Error(message);
    }

    return data as T;
  }
}
