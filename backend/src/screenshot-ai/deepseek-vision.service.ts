import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ScreenshotAiAnalysisResult,
  ScreenshotActivityType,
  ScreenshotAiCategory,
  SCREENSHOT_AI_ACTIVITY_TYPES,
  SCREENSHOT_AI_CATEGORIES,
} from './screenshot-ai.types';
import {
  categoryFromFlag,
  deriveProductivityFlag,
  sanitizeScreenshotCopy,
  visionAnalysisPayload,
} from './screenshot-ai-copy';
import { ScreenshotImageContext } from './screenshot-image-context.service';

const PRODUCTIVITY_ANALYSIS_PROMPT = `You are reviewing ONE screenshot frame of an employee's computer for a time-tracking program.

Write as if you are looking at that frame. Describe what the employee is doing. Do not mention OCR, Tesseract, extraction, pipelines, "we saw in OCR", or that text was provided to you.

Return JSON only (no markdown):
{
  "description": "2-3 sentences: what the employee is doing in this frame. Name the app, site, document, or task on screen. If the frame is locked, idle, blank, or ambiguous, say that plainly.",
  "feedback_for_employee": "1-2 sentences of constructive coaching in second person ('you'). Acknowledge focused work; flag distraction only when the frame shows it. Never mention OCR.",
  "activity_type": "development|communication|email|document|design|research|social|gaming|shopping|media|advertising|networking|music|general",
  "category": "productive|neutral|distraction",
  "is_work_related": true,
  "confidence_score": 0-100,
  "distraction_score": 0-100,
  "productivity_flag": "on_task|mixed|off_task|idle|unclear",
  "visible_evidence": ["short factual observation 1", "observation 2"]
}

This-frame status (productivity_flag) — required, from THIS screenshot only:
- on_task: focused work (IDE, docs, spreadsheets, work chat/email, meetings, tickets, design, work research).
- mixed: work and non-work both visible in this frame.
- off_task: social, entertainment, gaming, shopping, or unrelated personal browsing, and no live meeting is visible.
- idle: lock screen, login screen, screensaver, empty desktop, or no meaningful activity in the frame.
- unclear: not enough in the frame to judge.

Category:
- productive: on_task work.
- distraction: off_task.
- neutral: idle, system dialogs, or unclear.

Dual-monitor / stitched screenshots:
- If ANY region shows an active video meeting (Google Meet, Zoom, Teams, Webex, Skype), the whole frame is on_task communication: category=productive, is_work_related=true, distraction_score=0, productivity_flag=on_task.
- Do not mark a meeting off_task because another monitor is idle, a desktop, email, or unrelated content.

Scoring:
- confidence_score: high only when the frame content is specific; cap at 55 if only the app name is known.
- distraction_score: 0 = fully work-aligned in this frame; 100 = clear non-work.

Never invent URLs, messages, or personal details not present in the frame. Never comment on sensitive personal attributes.`;

const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api';
const OPENROUTER_DEFAULT_MODEL = 'deepseek/deepseek-chat';

function trimEnv(value: string | undefined | null): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed || null;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

function openRouterModel(explicit: string | null): string {
  if (!explicit) return OPENROUTER_DEFAULT_MODEL;
  if (explicit.includes('/')) return explicit;
  if (explicit === 'deepseek-chat') return OPENROUTER_DEFAULT_MODEL;
  return `deepseek/${explicit}`;
}

const METADATA_ONLY_PROMPT = `You are judging ONE screenshot frame from application name and window title only. The pixel contents of the frame were not readable.

Do not mention OCR, extraction, or missing image processing. Do not pretend you saw documents, messages, or sites that are not in the title.

Return JSON only:
{
  "description": "1-2 sentences on what the employee is likely doing in this frame from the app and window title.",
  "feedback_for_employee": "1 brief coaching sentence, or say more of the frame is needed for specific feedback. Never mention OCR.",
  "activity_type": "development|communication|email|document|design|research|social|gaming|shopping|media|advertising|networking|music|general",
  "category": "productive|neutral|distraction",
  "is_work_related": true,
  "confidence_score": 0-100,
  "distraction_score": 0-100,
  "productivity_flag": "on_task|mixed|off_task|idle|unclear",
  "visible_evidence": ["app and window title only"]
}

Cap confidence_score at 50. Default category=neutral and productivity_flag=unclear unless the title clearly shows work, distraction, idle/lock, or a live meeting.
If the application or window title is a video meeting (Google Meet, Zoom, Teams, Webex, Skype), use category=productive, is_work_related=true, distraction_score=0, productivity_flag=on_task.`;

@Injectable()
export class DeepseekVisionService {
  private readonly logger = new Logger(DeepseekVisionService.name);
  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly textModel: string;
  private readonly referer: string;
  private readonly appTitle: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = trimEnv(this.config.get<string>('OPENROUTER_API_KEY'));
    this.baseUrl = stripTrailingSlash(
      trimEnv(this.config.get<string>('OPENROUTER_API_BASE_URL')) || OPENROUTER_DEFAULT_BASE_URL,
    );
    this.textModel = openRouterModel(trimEnv(this.config.get<string>('OPENROUTER_MODEL')));
    this.referer =
      trimEnv(this.config.get<string>('OPENROUTER_HTTP_REFERER')) || 'https://app.alyson.ai';
    this.appTitle = trimEnv(this.config.get<string>('OPENROUTER_APP_TITLE')) || 'Alyson Pulse';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Generic JSON chat completion (leave classifier, coach, etc.).
   * Reuses the same text model as screenshot analysis.
   */
  async chatJson(params: {
    systemPrompt: string;
    userContent: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ parsed: Record<string, unknown>; model?: string; usage?: Record<string, unknown> }> {
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured');
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
      throw new Error('OPENROUTER_API_KEY is not configured');
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
      raw: visionAnalysisPayload(
        {
          model: payload.model,
          usage: payload.usage,
          vision_used: hasImageEvidence,
          vision_route: hasImageEvidence
            ? `${imageContext.route}+openrouter`
            : 'metadata-only+openrouter',
          image_context: {
            ocr_chars: imageContext.ocrText?.length ?? 0,
            label_count: imageContext.labels.length,
            labels: imageContext.labels,
          },
          parsed: payload.parsed,
        },
        result,
      ),
    };
  }

  private buildImageEvidenceUserMessage(
    params: { appName: string | null; windowTitle: string | null; capturedAt: string },
    imageContext: ScreenshotImageContext,
  ): string {
    const sections = [
      'Analyze this single screenshot frame. Describe what the employee is doing and set productivity_flag for this frame only.',
      this.buildMetadataBlock(params.appName, params.windowTitle, params.capturedAt),
    ];

    if (imageContext.labels.length > 0) {
      sections.push(`On-screen scene: ${imageContext.labels.join(', ')}`);
    }

    if (imageContext.ocrText?.trim()) {
      sections.push(
        'On-screen content in this frame:\n---\n' + imageContext.ocrText.trim() + '\n---',
      );
    }

    sections.push(
      'Return JSON for this frame. Do not mention how the on-screen content was obtained.',
    );
    return sections.join('\n\n');
  }

  private buildMetadataUserMessage(
    appName: string | null,
    windowTitle: string | null,
    capturedAt: string,
  ): string {
    return [
      'Only the app and window title are available for this frame.',
      this.buildMetadataBlock(appName, windowTitle, capturedAt),
      'Return JSON with low confidence. Do not invent on-screen details.',
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
        'HTTP-Referer': this.referer,
        'X-Title': this.appTitle,
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
      throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 200)}`);
    }

    const payload = (await response.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: Record<string, unknown>;
    };

    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty OpenRouter response');
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      throw new Error('OpenRouter returned invalid JSON');
    }

    return { parsed, model: payload.model, usage: payload.usage ?? undefined };
  }

  private normalizeResult(
    raw: Record<string, unknown>,
    opts?: { metadataOnly?: boolean },
  ): ScreenshotAiAnalysisResult {
    const activityType = String(raw.activity_type || 'general');
    const rawCategory = String(raw.category || 'neutral');
    const description =
      sanitizeScreenshotCopy(String(raw.description || raw.summary || '')).slice(0, 600) ||
      'Activity in this frame could not be determined.';
    const feedback = sanitizeScreenshotCopy(String(raw.feedback_for_employee || '')).slice(0, 400);
    const productivityFlag = deriveProductivityFlag({
      flag: raw.productivity_flag,
      category: rawCategory,
      description,
    });
    const category = (SCREENSHOT_AI_CATEGORIES as readonly string[]).includes(rawCategory)
      ? (rawCategory as ScreenshotAiCategory)
      : categoryFromFlag(productivityFlag, 'neutral');

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
      category,
      is_work_related:
        raw.is_work_related == null ? productivityFlag === 'on_task' : Boolean(raw.is_work_related),
      confidence_score: confidence,
      distraction_score: this.clampScore(raw.distraction_score, 0),
      description,
      summary: description,
      feedback: feedback || undefined,
      productivity_flag: productivityFlag,
    };
  }

  private clampScore(value: unknown, fallback: number): number {
    const n = typeof value === 'number' ? value : parseInt(String(value), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(100, Math.round(n)));
  }
}
