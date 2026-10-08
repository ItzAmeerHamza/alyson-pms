import {
  ScreenshotAiAnalysisResult,
  ScreenshotAiCategory,
  ScreenshotProductivityFlag,
  SCREENSHOT_AI_PRODUCTIVITY_FLAGS,
} from './screenshot-ai.types';

const PIPELINE_PHRASES: Array<[RegExp, string]> = [
  [/\bwe (?:saw|see|observed) in (?:the )?OCR(?:\s+that)?\b/gi, ''],
  [/\bbased on (?:the )?OCR(?: text)?\b/gi, ''],
  [/\bOCR (?:text |content )?(?:shows|indicates|reveals|suggests|mentions) that\b/gi, ''],
  [/\bOCR (?:text |content )?(?:shows|indicates|reveals|suggests)\b/gi, ''],
  [/\b(?:visible )?text extracted from (?:the )?(?:screenshot|image)\b/gi, ''],
  [/\bextracted (?:via|by|from) OCR\b/gi, ''],
  [/\bfrom the OCR\b/gi, ''],
  [/\bthe OCR\b/gi, ''],
  [/\bTesseract\b/gi, ''],
  [/\bOCR[- ]extracted\b/gi, ''],
  [/\b\(OCR\)\b/gi, ''],
  [/\bOCR\b/gi, ''],
];

const IDLE_FRAME_RE =
  /\b(lock(ed)? screen|login screen|sign[- ]in screen|screensaver|empty desktop|blank (?:screen|desktop)|no (?:meaningful )?activity|screen is idle)\b/i;

export function sanitizeScreenshotCopy(text: string): string {
  let out = String(text || '');
  for (const [pattern, replacement] of PIPELINE_PHRASES) {
    out = out.replace(pattern, replacement);
  }
  return out
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/^[.,;:\s]+/, '')
    .trim();
}

export function normalizeProductivityFlag(value: unknown): ScreenshotProductivityFlag | null {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if ((SCREENSHOT_AI_PRODUCTIVITY_FLAGS as readonly string[]).includes(raw)) {
    return raw as ScreenshotProductivityFlag;
  }
  if (raw === 'focused' || raw === 'productive' || raw === 'working') return 'on_task';
  if (raw === 'distracted' || raw === 'unproductive' || raw === 'non_work') return 'off_task';
  if (raw === 'locked' || raw === 'idle_screen' || raw === 'away') return 'idle';
  return null;
}

export function deriveProductivityFlag(opts: {
  flag?: unknown;
  category?: string | null;
  description?: string | null;
}): ScreenshotProductivityFlag {
  const explicit = normalizeProductivityFlag(opts.flag);
  if (explicit) return explicit;
  if (IDLE_FRAME_RE.test(String(opts.description || ''))) return 'idle';
  if (opts.category === 'distraction') return 'off_task';
  if (opts.category === 'productive') return 'on_task';
  return 'unclear';
}

export function visionAnalysisPayload(
  raw: Record<string, unknown>,
  result: ScreenshotAiAnalysisResult,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const parsed = {
    ...(((raw.parsed as Record<string, unknown> | undefined) || {}) as Record<string, unknown>),
    description: result.description,
    summary: result.description,
    feedback_for_employee: result.feedback || '',
    productivity_flag: result.productivity_flag,
    activity_type: result.activity_type,
    category: result.category,
    is_work_related: result.is_work_related,
  };
  return {
    ...raw,
    ...extra,
    description: result.description,
    productivity_flag: result.productivity_flag,
    parsed,
  };
}

export function categoryFromFlag(
  flag: ScreenshotProductivityFlag,
  fallback: ScreenshotAiCategory,
): ScreenshotAiCategory {
  if (flag === 'on_task') return 'productive';
  if (flag === 'off_task') return 'distraction';
  if (flag === 'idle') return 'neutral';
  return fallback;
}
