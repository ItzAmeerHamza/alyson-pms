import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ScreenshotAiAnalysisResult,
  ScreenshotActivityType,
  ScreenshotAiCategory,
  SCREENSHOT_AI_ACTIVITY_TYPES,
  SCREENSHOT_AI_CATEGORIES,
} from './screenshot-ai.types';
import { ScreenshotImageContext } from './screenshot-image-context.service';

const PRODUCTIVITY_ANALYSIS_PROMPT = `You are a professional productivity analyst reviewing employee work screenshots for a time-tracking and coaching program.

Managers use your analysis to give fair, specific feedback to employees. Scrutinize the evidence carefully — do not guess beyond what is visible.

You receive metadata (application, window title) and often OCR text / scene labels extracted from the screenshot image.

Return JSON only (no markdown):
{
  "description": "2-3 sentences describing what the employee was doing based on evidence. Name specific apps, sites, documents, or tasks visible. Say clearly if the screen is idle, locked, blank, or ambiguous.",
  "feedback_for_employee": "1-2 sentences of constructive coaching in second person ('you'). Acknowledge productive work when earned; gently flag distractions or context-switching when evidence supports it. Respectful, actionable, never shaming.",
  "activity_type": "development|communication|email|document|design|research|social|gaming|shopping|media|advertising|networking|music|general",
  "category": "productive|neutral|distraction",
  "is_work_related": true,
  "confidence_score": 0-100,
  "distraction_score": 0-100,
  "productivity_flag": "on_task|mixed|off_task|unclear",
  "visible_evidence": ["short factual observation 1", "observation 2"]
}

Classification rules:
- productive: clear work — IDE/code, docs, spreadsheets, work email/chat, meetings, Jira/Linear, design tools, research for work.
- distraction: social feeds, entertainment, gaming, shopping, unrelated personal browsing — only when OCR/title/metadata clearly show it.
- neutral: unclear, login screens, system dialogs, empty desktop, screensaver, insufficient evidence.

Scoring:
- confidence_score: high only when OCR or window title gives specific content; cap at 55 if only app name is known.
- distraction_score: 0 = fully work-aligned; 100 = clear non-work activity.
- productivity_flag: on_task (focused work), mixed (work + distraction signals), off_task (non-work), unclear (not enough evidence).

Never invent URLs, messages, or personal details not present in the evidence. Never comment on sensitive personal attributes.`;

const METADATA_ONLY_PROMPT = `You analyze employee computer activity when the screenshot image could not be read (no OCR available).

You only have application name and window title. Be honest about uncertainty — do not pretend you saw the screen.

Return JSON only:
{
  "description": "1-2 sentences on what the employee was LIKELY doing based on app/window title. State that the screenshot content was not available.",
  "feedback_for_employee": "1 brief neutral coaching sentence, or note that more context is needed for specific feedback.",
  "activity_type": "development|communication|email|document|design|research|social|gaming|shopping|media|advertising|networking|music|general",
  "category": "productive|neutral|distraction",
  "is_work_related": true,
  "confidence_score": 0-100,
  "distraction_score": 0-100,
  "productivity_flag": "on_task|mixed|off_task|unclear",
  "visible_evidence": ["metadata-only: app/window title"]
}

Cap confidence_score at 50. Use category=neutral unless window title clearly indicates work or distraction.`;

@Injectable()
export class DeepseekVisionService {
  private readonly logger = new Logger(DeepseekVisionService.name);
  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly textModel: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('DEEPSEEK_API_KEY') ?? null;
    this.baseUrl = (this.config.get<string>('DEEPSEEK_API_BASE_URL') || 'https://api.deepseek.com').replace(
      /\/$/,
      '',
    );
    this.textModel =
      this.config.get<string>('DEEPSEEK_TEXT_MODEL') ||
      this.config.get<string>('DEEPSEEK_MODEL') ||
      'deepseek-chat';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Generic JSON chat completion (leave classifier, etc.).
   * Reuses the same DeepSeek text model as screenshot analysis.
   */
  async chatJson(params: {
    systemPrompt: string;
    userContent: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ parsed: Record<string, unknown>; model?: string; usage?: Record<string, unknown> }> {
    if (!this.apiKey) {
      throw new Error('DEEPSEEK_API_KEY is not configured');
    }
    return this.callChat({
      model: this.textModel,
      systemPrompt: params.systemPrompt,
      userContent: params.userContent,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
    });
  }

  async analyzeScreenshot(params: {
    imageBase64: string;
    mimeType: string;
    appName: string | null;
    windowTitle: string | null;
    capturedAt: string;
    imageContext?: ScreenshotImageContext;
  }): Promise<{ result: ScreenshotAiAnalysisResult; raw: Record<string, unknown> }> {
    if (!this.apiKey) {
      throw new Error('DEEPSEEK_API_KEY is not configured');
    }

    const imageContext = params.imageContext ?? { ocrText: null, labels: [], route: 'unavailable' as const };
    const hasImageEvidence = Boolean(imageContext.ocrText?.trim() || imageContext.labels.length > 0);

    const userText = hasImageEvidence
      ? this.buildImageEvidenceUserMessage(params, imageContext)
      : this.buildMetadataUserMessage(params.appName, params.windowTitle, params.capturedAt);

    const payload = await this.callChat({
      model: this.textModel,
      systemPrompt: hasImageEvidence ? PRODUCTIVITY_ANALYSIS_PROMPT : METADATA_ONLY_PROMPT,
      userContent: userText,
    });

    const result = this.normalizeResult(payload.parsed, { metadataOnly: !hasImageEvidence });
    return {
      result,
      raw: {
        model: payload.model,
        usage: payload.usage,
        vision_used: hasImageEvidence,
        vision_route: hasImageEvidence ? `${imageContext.route}+deepseek` : 'metadata-only+deepseek',
        image_context: {
          ocr_chars: imageContext.ocrText?.length ?? 0,
          label_count: imageContext.labels.length,
          labels: imageContext.labels,
        },
        parsed: payload.parsed,
      },
    };
  }

  private buildImageEvidenceUserMessage(
    params: { appName: string | null; windowTitle: string | null; capturedAt: string },
    imageContext: ScreenshotImageContext,
  ): string {
    const sections = [
      'Analyze this employee screenshot for productivity and coaching feedback.',
      this.buildMetadataBlock(params.appName, params.windowTitle, params.capturedAt),
    ];

    if (imageContext.labels.length > 0) {
      sections.push(`Scene labels (AWS Rekognition): ${imageContext.labels.join(', ')}`);
    }

    if (imageContext.ocrText?.trim()) {
      sections.push(
        'Visible text extracted from screenshot (OCR — treat as primary evidence):\n---\n' +
          imageContext.ocrText.trim() +
          '\n---',
      );
    }

    sections.push('Scrutinize the evidence above and return the JSON assessment.');
    return sections.join('\n\n');
  }

  private buildMetadataUserMessage(
    appName: string | null,
    windowTitle: string | null,
    capturedAt: string,
  ): string {
    return [
      'Screenshot image content was NOT available — metadata only.',
      this.buildMetadataBlock(appName, windowTitle, capturedAt),
      'Return the JSON assessment with low confidence.',
    ].join('\n\n');
  }

  private buildMetadataBlock(
    appName: string | null,
    windowTitle: string | null,
    capturedAt: string,
  ): string {
    return [
      appName ? `Application: ${appName}` : 'Application: (unknown)',
      windowTitle ? `Window title: ${windowTitle}` : 'Window title: (unknown)',
      `Captured at: ${capturedAt}`,
    ].join('\n');
  }

  private async callChat(params: {
    model: string;
    systemPrompt: string;
    userContent: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ parsed: Record<string, unknown>; model?: string; usage?: Record<string, unknown> }> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: params.model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: params.systemPrompt },
          { role: 'user', content: params.userContent },
        ],
        max_tokens: params.maxTokens ?? 900,
        temperature: params.temperature ?? 0.15,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`DeepSeek ${response.status}: ${body.slice(0, 200)}`);
    }

    const payload = (await response.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: Record<string, unknown>;
    };

    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty DeepSeek response');
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      throw new Error('DeepSeek returned invalid JSON');
    }

    return { parsed, model: payload.model, usage: payload.usage ?? undefined };
  }

  private normalizeResult(
    raw: Record<string, unknown>,
    opts?: { metadataOnly?: boolean },
  ): ScreenshotAiAnalysisResult {
    const activityType = String(raw.activity_type || 'general');
    const category = String(raw.category || 'neutral');
    const description = String(raw.description || raw.summary || 'Activity detected').slice(0, 600);
    const feedback = String(raw.feedback_for_employee || '').trim().slice(0, 400);
    const combinedSummary = feedback
      ? `${description} ${feedback}`.slice(0, 900)
      : description;

    let confidence = this.clampScore(raw.confidence_score, 50);
    if (opts?.metadataOnly) {
      confidence = Math.min(confidence, 50);
    } else if (!raw.visible_evidence) {
      confidence = Math.min(confidence, 75);
    }

    return {
      activity_type: (SCREENSHOT_AI_ACTIVITY_TYPES as readonly string[]).includes(activityType)
        ? (activityType as ScreenshotActivityType)
        : 'general',
      category: (SCREENSHOT_AI_CATEGORIES as readonly string[]).includes(category)
        ? (category as ScreenshotAiCategory)
        : 'neutral',
      is_work_related: Boolean(raw.is_work_related),
      confidence_score: confidence,
      distraction_score: this.clampScore(raw.distraction_score, 0),
      description: combinedSummary,
      summary: combinedSummary,
    };
  }

  private clampScore(value: unknown, fallback: number): number {
    const n = typeof value === 'number' ? value : parseInt(String(value), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(100, Math.round(n)));
  }
}
