/**
 * AI Screenshot Analyzer — pattern + DeepSeek text + vision (VL + fallbacks)
 *
 * Runs on Supabase Edge (Deno). Configure via Edge Function secrets, e.g.:
 *   supabase secrets set DEEPSEEK_API_KEY=sk-...
 *
 * Secrets:
 * - DEEPSEEK_API_KEY — required for LLM text (window title / app). Optional vault: get_secret('DEEPSEEK_API_KEY')
 * - DEEPSEEK_MODEL — optional; default deepseek-v4-flash
 * - DEEPSEEK_API_BASE — optional; default https://api.deepseek.com (chat/completions — text-only for v4 flash/pro)
 * - Request body (optional): deepseek_model, deepseek_vision_model — must be deepseek-v4-flash or deepseek-v4-pro
 * - DEEPSEEK_VISION_MODEL — chat multimodal fallback model id (often still text-only on DeepSeek chat)
 * - DEEPSEEK_VL_API_URL — optional full URL for a vision API that accepts { image_url, prompt }; not set = skip (official api.deepseek.com chat is text-only; verify any VL host before use)
 * - DEEPSEEK_VL_API_KEY — optional; defaults to DEEPSEEK_API_KEY if unset
 * - DEEPSEEK_VL_DISABLED — if "true", skip VL and use fallbacks only
 * - VISION_API_BASE + VISION_API_KEY + VISION_MODEL — optional OpenAI-compatible /v1/chat/completions for true multimodal (e.g. gpt-4o-mini)
 * - VISION_MAX_TOKENS — optional cap for vision JSON responses (default 8192)
 * - INTELLIGENCE_TEXT_MAX_TOKENS — optional cap for DeepSeek text-only screenshot_intelligence (default 8192)
 * - SCREENSHOT_INTELLIGENCE_TEXT_MODE — off | fallback | always (default fallback). fallback = run DeepSeek text JSON when multimodal did not produce screenshot_intelligence.
 * - Request body (optional): visual_scene_transcript — text description/OCR/transcript of the screen; used with DeepSeek chat (no pixels).
 * - Request body (optional): screenshot_intelligence_text_mode — overrides env for one request.
 * - SCREENSHOTS_STORAGE_BUCKET — optional; default screenshots (signed URL for VL when file_path is set)
 * - SCREEN_ANALYSIS_DISABLED — if "true", skip canonical JSON (screenshots.screen_analysis).
 * - SCREEN_ANALYSIS_MAX_TOKENS — optional cap for canonical JSON DeepSeek call (default 4096).
 * - Request body (optional): canonical_screen_analysis_only — if true, only fills screen_analysis via DeepSeek (cheap queue mode).
 */

/// <reference types="./types.d.ts" />
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || 'https://timeflow.ebdaadt.com,http://localhost:8080,http://localhost:5173').split(',').map(o => o.trim());

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.some(o => origin === o) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

let _cachedDeepSeekKey: string | null = null;

async function getDeepSeekKeyFromVault(supabase: any): Promise<string | null> {
  if (_cachedDeepSeekKey) return _cachedDeepSeekKey;
  try {
    const { data } = await supabase.rpc('get_secret', { secret_name: 'DEEPSEEK_API_KEY' }).single();
    if (data?.decrypted_secret) {
      _cachedDeepSeekKey = data.decrypted_secret;
      return _cachedDeepSeekKey;
    }
  } catch (_e) { /* vault unavailable */ }
  return null;
}

function getDeepSeekChatUrl(): string {
  const base = (Deno.env.get('DEEPSEEK_API_BASE') || 'https://api.deepseek.com').replace(/\/$/, '');
  return `${base}/chat/completions`;
}

/** Only models we allow from request body (prevents arbitrary model injection). */
const ALLOWED_DEEPSEEK_MODELS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro']);
const ANALYZER_RUNTIME_VERSION = '5.4.0-canonical-screen-analysis';

/** DeepSeek JSON schema stored in screenshots.screen_analysis */
const CANONICAL_SCREEN_KEYS = [
  'screenshot_id',
  'timestamp',
  'user_id',
  'device',
  'screen_category',
  'application',
  'screen_content',
  'activity_status',
  'task_alignment',
  'video_audio',
  'privacy_flags',
  'distraction_risk',
  'task_relevance',
  'distraction_level',
  'confidence_score',
  'recommendation',
  'metadata',
] as const;

function screenAnalysisMaxTokens(): number {
  const n = Number(Deno.env.get('SCREEN_ANALYSIS_MAX_TOKENS') || '4096');
  return Number.isFinite(n) && n >= 512 ? Math.min(8192, Math.floor(n)) : 4096;
}

function pickDeepseekModel(preferred: unknown, fallback: string): string {
  const p = typeof preferred === 'string' ? preferred.trim() : '';
  if (ALLOWED_DEEPSEEK_MODELS.has(p)) return p;
  const f = typeof fallback === 'string' ? fallback.trim() : '';
  if (ALLOWED_DEEPSEEK_MODELS.has(f)) return f;
  return 'deepseek-v4-flash';
}

function envDefaultTextModel(): string {
  return pickDeepseekModel(Deno.env.get('DEEPSEEK_MODEL'), 'deepseek-v4-flash');
}

/** Bearer token for DeepSeek API. */
function getTextApiToken(): string {
  return _cachedDeepSeekKey || Deno.env.get('DEEPSEEK_API_KEY') || '';
}

function getDeepSeekToken(): string {
  return _cachedDeepSeekKey || Deno.env.get('DEEPSEEK_API_KEY') || '';
}

function hasDeepSeekText(): boolean {
  return !!getTextApiToken();
}

function screenshotsBucket(): string {
  return Deno.env.get('SCREENSHOTS_STORAGE_BUCKET') || 'screenshots';
}

function visionJsonMaxTokens(): number {
  const n = Number(Deno.env.get('VISION_MAX_TOKENS') || '8192');
  return Number.isFinite(n) && n >= 256 ? Math.min(32768, Math.floor(n)) : 8192;
}

function intelligenceTextMaxTokens(): number {
  const n = Number(Deno.env.get('INTELLIGENCE_TEXT_MAX_TOKENS') || '8192');
  return Number.isFinite(n) && n >= 256 ? Math.min(32768, Math.floor(n)) : 8192;
}

type IntelligencePixelSource = 'openai_compatible' | 'deepseek_vl';

function toStrArray(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return [];
    try {
      const p = JSON.parse(t);
      if (Array.isArray(p)) return p.map((x) => String(x).trim()).filter(Boolean);
    } catch { /* ignore */ }
    return t.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  }
  return [String(v)];
}

function clampConfidence01(n: unknown): number | null {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  if (x > 1 && x <= 100) return Math.max(0, Math.min(1, x / 100));
  return Math.max(0, Math.min(1, x));
}

/** Normalize sloppy model output (string vs array, confidence scales). */
function coerceScreenshotIntelligenceShape(intel: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...intel };

  if (out.meta != null && typeof out.meta === 'object') {
    const m = { ...(out.meta as Record<string, unknown>) };
    for (const k of ['image_pixel_width', 'image_pixel_height'] as const) {
      const n = Number(m[k]);
      if (Number.isFinite(n)) m[k] = Math.round(n);
    }
    const ar = Number(m.aspect_ratio);
    if (Number.isFinite(ar)) m.aspect_ratio = Math.round(ar * 10000) / 10000;
    out.meta = m;
  }

  if (out.host_os_ui != null && typeof out.host_os_ui === 'object') {
    const h = out.host_os_ui as Record<string, unknown>;
    out.host_os_ui = { ...h, evidence: toStrArray(h.evidence) };
  }

  if (out.active_surface != null && typeof out.active_surface === 'object') {
    const s = out.active_surface as Record<string, unknown>;
    out.active_surface = {
      ...s,
      chrome_category_rows_visible: toStrArray(s.chrome_category_rows_visible),
      example_visible_game_titles: toStrArray(s.example_visible_game_titles),
      ui_badges_observed: toStrArray(s.ui_badges_observed),
    };
  }

  if (out.open_tabs_signals != null && typeof out.open_tabs_signals === 'object') {
    const t = out.open_tabs_signals as Record<string, unknown>;
    out.open_tabs_signals = {
      ...t,
      work_adjacent_favicons_inferred: toStrArray(t.work_adjacent_favicons_inferred),
    };
  }

  for (const key of ['primary_activity_hypothesis', 'secondary_context'] as const) {
    const o = out[key];
    if (o != null && typeof o === 'object') {
      const r = { ...(o as Record<string, unknown>) };
      const c = clampConfidence01(r.confidence_0_1);
      if (c != null) r.confidence_0_1 = c;
      out[key] = r;
    }
  }

  if (out.sprint_matching_hints != null && typeof out.sprint_matching_hints === 'object') {
    const sp = out.sprint_matching_hints as Record<string, unknown>;
    out.sprint_matching_hints = {
      ...sp,
      suggested_feature_fields_for_ticket_matching: toStrArray(sp.suggested_feature_fields_for_ticket_matching),
    };
  }

  if (out.attributes_flat != null && typeof out.attributes_flat === 'object') {
    const f = out.attributes_flat as Record<string, unknown>;
    const d = clampConfidence01(f.distraction_risk_score_suggested_0_1);
    out.attributes_flat = {
      ...f,
      ...(d != null ? { distraction_risk_score_suggested_0_1: d } : {}),
    };
  }

  const cls = out.classifications;
  const clsArr = Array.isArray(cls) ? cls : [];
  out.classifications = clsArr.map((item) => {
    if (item != null && typeof item === 'object') {
      const it = item as Record<string, unknown>;
      const c = clampConfidence01(it.confidence_0_1) ?? 0.5;
      return {
        label: String(it.label ?? 'unknown'),
        confidence_0_1: c,
        rationale: String(it.rationale ?? ''),
      };
    }
    return { label: String(item), confidence_0_1: 0.5, rationale: '' };
  });

  out.feature_vector_suggestions = toStrArray(out.feature_vector_suggestions);

  if (out.analysis_method_note != null) {
    out.analysis_method_note = String(out.analysis_method_note);
  }

  return out;
}

function finalizeIntelligenceObject(
  intel: Record<string, unknown>,
  ctx: {
    pixelSource?: IntelligencePixelSource | null;
    textOnly?: boolean;
    transcriptSupplied?: boolean;
  },
): Record<string, unknown> {
  const coerced = coerceScreenshotIntelligenceShape(intel);
  const existing = coerced.analysis_method_note;
  if (typeof existing === 'string' && existing.trim().length > 0) {
    return coerced;
  }
  let note: string;
  if (ctx.pixelSource === 'openai_compatible') {
    note =
      'Multimodal: model saw pixels via OpenAI-compatible chat completions (VISION_API_*). Confidences are pixel-grounded subject to model quality.';
  } else if (ctx.pixelSource === 'deepseek_vl') {
    note =
      'Multimodal: model saw pixels via DeepSeek VL (or compatible) HTTP vision endpoint. Confidences are pixel-grounded subject to model quality.';
  } else if (ctx.textOnly) {
    note = ctx.transcriptSupplied
      ? 'Text-only: api.deepseek.com chat/completions (no image input). Structured JSON from visual_scene_transcript plus window/app/URL metadata. Confidences are NOT pixel-grounded; calibrate downstream.'
      : 'Text-only: api.deepseek.com chat/completions (no image input). Inferred from window title, app name, and URL metadata only — no visual transcript. Confidences are NOT pixel-grounded; high uncertainty for on-screen content.';
  } else {
    note = 'Analysis method could not be classified; treat confidences cautiously.';
  }
  return { ...coerced, analysis_method_note: note };
}

function applyIntelligencePostProcess(
  intel: Record<string, unknown> | null | undefined,
  ctx: Parameters<typeof finalizeIntelligenceObject>[1],
): Record<string, unknown> | null {
  if (!intel || typeof intel !== 'object') return null;
  return finalizeIntelligenceObject(intel as Record<string, unknown>, ctx);
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

/** PNG / JPEG dimension + MIME sniff (no full decode). */
function sniffImageMeta(bytes: Uint8Array, storagePath?: string | null): {
  image_file_format_mime: string;
  image_pixel_width: number;
  image_pixel_height: number;
  aspect_ratio: number;
  approx_file_type_note: string | null;
} | null {
  if (bytes.length < 24) return null;
  let mime = '';
  let w = 0;
  let h = 0;

  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    mime = 'image/png';
    w = readU32BE(bytes, 16);
    h = readU32BE(bytes, 20);
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    mime = 'image/jpeg';
    let i = 2;
    while (i < bytes.length - 9) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        i += 2;
        continue;
      }
      const segLen = (bytes[i + 2] << 8) | bytes[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        h = (bytes[i + 5] << 8) | bytes[i + 6];
        w = (bytes[i + 7] << 8) | bytes[i + 8];
        break;
      }
      i += 2 + segLen;
    }
  } else {
    return null;
  }

  if (!w || !h) return null;
  const ext = storagePath?.split('.').pop()?.toLowerCase() || '';
  let approx_file_type_note: string | null = null;
  if (ext === 'png' && mime === 'image/jpeg') approx_file_type_note = 'extension_says_png_but_content_is_jpeg';
  else if ((ext === 'jpg' || ext === 'jpeg') && mime === 'image/png') {
    approx_file_type_note = 'extension_says_jpg_but_content_is_png';
  }

  const aspect_ratio = Math.round((w / h) * 10000) / 10000;
  return { image_file_format_mime: mime, image_pixel_width: w, image_pixel_height: h, aspect_ratio, approx_file_type_note };
}

function mergeServerMetaIntoIntelligence(
  intel: Record<string, unknown>,
  serverMeta: NonNullable<ReturnType<typeof sniffImageMeta>>,
): Record<string, unknown> {
  const prev = (intel.meta && typeof intel.meta === 'object') ? intel.meta as Record<string, unknown> : {};
  const meta = {
    ...prev,
    source: 'employee_screenshot',
    image_file_format_mime: serverMeta.image_file_format_mime,
    image_pixel_width: serverMeta.image_pixel_width,
    image_pixel_height: serverMeta.image_pixel_height,
    aspect_ratio: serverMeta.aspect_ratio,
    approx_file_type_note: serverMeta.approx_file_type_note ?? prev.approx_file_type_note ?? null,
  };
  return { ...intel, meta };
}

function briefLineFromIntelligence(intel: Record<string, unknown>): string {
  const p = intel.primary_activity_hypothesis as Record<string, unknown> | undefined;
  const a = intel.active_surface as Record<string, unknown> | undefined;
  const parts = [
    p?.fine_label != null ? String(p.fine_label) : '',
    p?.coarse_label != null ? String(p.coarse_label) : '',
    a?.brand_visible != null ? String(a.brand_visible) : '',
    p?.rationale != null ? String(p.rationale).slice(0, 220) : '',
  ].filter(Boolean);
  return parts.join(' — ').slice(0, 600) || 'screenshot_intelligence';
}

function extractFirstJsonObject(s: string): string | null {
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function isScreenshotIntelligenceShape(obj: Record<string, unknown>): boolean {
  return (
    obj.meta != null &&
    typeof obj.meta === 'object' &&
    obj.primary_activity_hypothesis != null &&
    typeof obj.primary_activity_hypothesis === 'object'
  );
}

function mapIntelligenceToCategory(parsed: Record<string, unknown>): string | undefined {
  const primary = parsed.primary_activity_hypothesis as Record<string, unknown> | undefined;
  const attrs = parsed.attributes_flat as Record<string, unknown> | undefined;
  const surface = parsed.active_surface as Record<string, unknown> | undefined;
  const coarse = String(primary?.coarse_label || '').toLowerCase();
  const fine = String(primary?.fine_label || '').toLowerCase();
  const fg = String(attrs?.foreground_domain_category || '').toLowerCase();
  const pageFam = String(surface?.page_family || '').toLowerCase();

  if (fg.includes('game') || coarse.includes('game') || fine.includes('game') || pageFam.includes('game')) {
    return 'gaming';
  }
  if (fg.includes('social') || coarse.includes('social')) return 'social_media';
  if (fg.includes('shop')) return 'shopping';
  if (coarse.includes('communication') || fg.includes('communication')) return 'communication';
  if (
    fg.includes('video') || fg.includes('stream') || coarse.includes('entertainment') ||
    coarse.includes('recreational') || pageFam.includes('media')
  ) {
    return 'entertainment';
  }
  if (
    attrs?.focus_on_work_surface === true || coarse.includes('development') || coarse.includes('work') ||
    fg.includes('dev') || fg.includes('productive')
  ) {
    return 'productive';
  }
  return 'other';
}

function normalizeIntelligenceVisionPayload(parsed: Record<string, unknown>, model: string): any {
  const primary = parsed.primary_activity_hypothesis as Record<string, unknown> | undefined;
  const attrs = parsed.attributes_flat as Record<string, unknown> | undefined;
  const surface = parsed.active_surface as Record<string, unknown> | undefined;
  const category = mapIntelligenceToCategory(parsed);
  const d0 = attrs?.distraction_risk_score_suggested_0_1;
  const distraction_score = typeof d0 === 'number' ? clampScore(Math.round(d0 * 100)) : undefined;
  const conf = clampConfidence01(primary?.confidence_0_1) ?? 0.85;
  const rationale = String(primary?.rationale || '');
  const brand = surface?.brand_visible != null ? String(surface.brand_visible) : '';
  const fine = primary?.fine_label != null ? String(primary.fine_label) : '';
  const coarse = primary?.coarse_label != null ? String(primary.coarse_label) : '';
  const detected_content = [fine || coarse, brand, rationale].filter(Boolean).join(' — ').slice(0, 500);

  const privacy = parsed.privacy_and_policy_signals as Record<string, unknown> | undefined;
  const privacy_concerns: string[] = [];
  if (privacy?.visible_secrets_likely === true) privacy_concerns.push('possible_secrets_visible');
  if (privacy?.pii_on_screen_likely === true) privacy_concerns.push('possible_pii_visible');

  const focusWork = attrs?.focus_on_work_surface === true;
  const is_work_related =
    focusWork ||
    category === 'productive' ||
    category === 'communication' ||
    (category === 'other' && coarse.includes('work'));

  return {
    success: true as const,
    screenshot_intelligence: parsed,
    detected_content: detected_content || rationale.slice(0, 500),
    category,
    is_work_related,
    confidence: conf,
    privacy_concerns,
    is_idle: false,
    productivity_score: distraction_score != null ? clampScore(100 - distraction_score) : undefined,
    distraction_score,
    model,
  };
}

function intelligenceSchemaJsonBlock(): string {
  return `{
  "analysis_method_note": string,
  "meta": {
    "source": "employee_screenshot",
    "image_file_format_mime": string,
    "image_pixel_width": number,
    "image_pixel_height": number,
    "aspect_ratio": number,
    "approx_file_type_note": string | null
  },
  "host_os_ui": { "os_family": string, "evidence": string[] },
  "browser_context": {
    "browser_family": string,
    "active_url_host": string | null,
    "active_url_scheme_https_assumed": boolean,
    "chrome_profile_badge_text": string | null,
    "install_pwa_prompt_visible": boolean,
    "tab_strip_density": string,
    "estimated_open_tabs": string
  },
  "active_surface": {
    "surface_type": string,
    "page_family": string,
    "brand_visible": string | null,
    "chrome_category_rows_visible": string[],
    "example_visible_game_titles": string[],
    "ui_badges_observed": string[],
    "global_search_present": boolean,
    "auth_cta_present": boolean,
    "status_bar_link_preview_host": string | null,
    "status_bar_link_preview_path_hint": string | null
  },
  "open_tabs_signals": { "work_adjacent_favicons_inferred": string[], "interpretation": string },
  "primary_activity_hypothesis": {
    "coarse_label": string,
    "fine_label": string,
    "confidence_0_1": number,
    "rationale": string
  },
  "secondary_context": { "label": string, "confidence_0_1": number, "rationale": string },
  "privacy_and_policy_signals": {
    "visible_secrets_likely": boolean,
    "pii_on_screen_likely": boolean,
    "screen_contents_safe_for_basic_ml_features": boolean,
    "caution": string
  },
  "sprint_matching_hints": {
    "foreground_suggests_work_story_match": boolean,
    "suggested_feature_fields_for_ticket_matching": string[],
    "current_foreground_match_feasibility": string
  },
  "attributes_flat": {
    "foreground_domain_category": string,
    "work_browser_profile": boolean,
    "multitasking_tab_load_high": boolean,
    "focus_on_work_surface": boolean,
    "distraction_risk_score_suggested_0_1": number,
    "potential_context_switch_cost_high": boolean
  },
  "classifications": [ { "label": string, "confidence_0_1": number, "rationale": string } ],
  "feature_vector_suggestions": string[]
}`;
}

/** Multimodal / pixel-based instructions (vision API). */
function buildScreenshotIntelligencePrompt(serverMetaHint: string): string {
  return `You are analyzing a single employee desktop screenshot for workforce analytics, distraction risk, and (optional) work-item matching.

Respond with ONLY one JSON object (no markdown, no prose). Include every top-level key in the schema below. Use null for unknown scalars, [] for arrays you cannot infer, and false/true only when justified by visible evidence.

All confidence_0_1 fields must be numbers between 0 and 1 (not 0–100). Arrays must be JSON arrays (not comma-separated strings).

Schema (types describe shape; replace with concrete values):
${intelligenceSchemaJsonBlock()}

Set analysis_method_note to state clearly that the model had access to the image pixels and which cues you used (e.g. URL bar, tab strip, page content).

Guidelines:
- Infer OS from window chrome (traffic lights, menu bar, taskbar style).
- Read URL bar / status-bar link preview when legible; otherwise null.
- Tab favicons: name inferred services conservatively (e.g. "github" only if octocat-like icon is clear).
- distraction_risk_score_suggested_0_1: higher when foreground is clearly non-work entertainment/games/social.
- classifications: 3–6 items covering foreground vs background tabs, profile cues, and sprint-alignment.
${serverMetaHint}`;
}

/** DeepSeek chat/completions only — no image bytes. */
function buildScreenshotIntelligenceTextPrompt(
  transcriptBlock: string,
  serverMetaHint: string,
): string {
  return `You are producing structured employee screenshot analytics for workforce and distraction modeling.

You do NOT have access to the raw image. You MUST infer conservatively from the textual evidence provided (visual transcript and/or window metadata only).

Respond with ONLY one JSON object (no markdown, no prose). Include every top-level key in the schema below.

All confidence_0_1 fields must be numbers between 0 and 1. Prefer lower confidence when evidence is thin. Arrays must be JSON arrays.

Schema:
${intelligenceSchemaJsonBlock()}

Set analysis_method_note explicitly: state that this run used DeepSeek chat completions with text-only input (no pixels), and summarize what inputs you received (transcript yes/no, metadata fields used).

Textual inputs for this request:
${transcriptBlock}
${serverMetaHint}`;
}

/** Base64 for data URLs without blowing the stack on large buffers. */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Prefer downloading from Storage via service role (reliable in Edge). Public image_url often 404s
 * if the bucket URL points at another project or the bucket was renamed.
 */
async function resolveVisionImageInput(
  supabase: any,
  screenshot: { image_url?: string | null; file_path?: string | null },
): Promise<
  | { imageUrl: string; source: 'storage' | 'public_url'; imageBytes?: Uint8Array; storagePath?: string }
  | { error: string }
> {
  const path = screenshot.file_path?.trim();
  if (path) {
    const bucket = screenshotsBucket();
    const { data: blob, error } = await supabase.storage.from(bucket).download(path);
    if (!error && blob) {
      try {
        const buf = new Uint8Array(await blob.arrayBuffer());
        const ext = path.toLowerCase().split('.').pop() || 'jpg';
        const mime =
          ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        const dataUrl = `data:${mime};base64,${uint8ArrayToBase64(buf)}`;
        return { imageUrl: dataUrl, source: 'storage', imageBytes: buf, storagePath: path };
      } catch (e: any) {
        console.warn('Vision: storage blob decode failed:', e?.message);
      }
    } else {
      console.warn(`Vision: storage download failed (${bucket}/${path}):`, error?.message);
    }
  }

  const publicUrl = screenshot.image_url?.trim();
  if (publicUrl) {
    return { imageUrl: publicUrl, source: 'public_url' };
  }

  return {
    error: path
      ? `Could not read screenshot file from storage and image_url is missing`
      : 'No file_path or image_url for vision',
  };
}

/**
 * HTTPS URL the VL API can fetch (VL endpoints reject data: URLs).
 * Prefer signed URL from Storage; else public http(s) image_url on the row.
 */
async function resolveRemoteImageUrlForVl(
  supabase: any,
  screenshot: { image_url?: string | null; file_path?: string | null },
): Promise<string | null> {
  const path = screenshot.file_path?.trim();
  if (path) {
    const bucket = screenshotsBucket();
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 600);
    if (!error && data?.signedUrl) return data.signedUrl;
    console.warn('VL: createSignedUrl failed:', error?.message);
  }
  const pub = screenshot.image_url?.trim();
  if (pub && /^https?:\/\//i.test(pub)) return pub;
  return null;
}

function getDeepSeekVlVisionUrl(): string {
  const u = (Deno.env.get('DEEPSEEK_VL_API_URL') || '').trim();
  return u.replace(/\/$/, '');
}

function getDeepSeekVlToken(): string {
  return (Deno.env.get('DEEPSEEK_VL_API_KEY') || '').trim() || getDeepSeekToken();
}

function visionOpenAiCompatibleUrl(): string | null {
  const b = (Deno.env.get('VISION_API_BASE') || '').trim();
  if (!b) return null;
  return `${b.replace(/\/$/, '')}/chat/completions`;
}

function getOpenAiCompatibleVisionToken(): string {
  return (Deno.env.get('VISION_API_KEY') || '').trim();
}

function getOpenAiCompatibleVisionModel(): string {
  return (Deno.env.get('VISION_MODEL') || 'gpt-4o-mini').trim();
}

/** Window titles that are useless for LLM context (prefer active_window_title when present). */
const WINDOW_TITLE_SENTINELS = new Set([
  '',
  'no window',
  'unknown',
  'untitled',
  '(unknown)',
  'n/a',
]);

function pickBestWindowTitle(bodyWindowTitle: unknown, screenshot: Record<string, unknown>): string {
  const candidates = [
    typeof bodyWindowTitle === 'string' ? bodyWindowTitle.trim() : '',
    String(screenshot.window_title || '').trim(),
    String(screenshot.active_window_title || '').trim(),
  ];
  for (const c of candidates) {
    const t = c.trim();
    if (!t) continue;
    if (WINDOW_TITLE_SENTINELS.has(t.toLowerCase())) continue;
    return t;
  }
  return candidates.map((c) => c.trim()).find(Boolean) || '';
}

function pickBestActiveUrl(screenshot: Record<string, unknown>): string {
  return String(screenshot.url || '').trim();
}

/** True when multimodal path actually consumed pixels (not DeepSeek text-only intelligence). */
function isMultimodalVisionResult(visionResult: { vision_route?: string; success?: boolean } | null): boolean {
  if (!visionResult?.success) return false;
  const r = visionResult.vision_route;
  return r === 'openai-compatible' || r === 'deepseek-vl' || r === 'deepseek-chat';
}

// Categories that trigger alerts
const ALERT_CATEGORIES = ['gaming', 'social_media', 'entertainment'];
const HIGH_ALERT_CATEGORIES = ['gaming'];

// Consecutive duplicate thresholds for alerts
const DUPLICATE_ALERT_THRESHOLDS = {
  LOW: 5,
  MEDIUM: 10,
  HIGH: 20,
  CRITICAL: 30,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function isValidCanonicalScreenAnalysis(obj: unknown): boolean {
  if (!isRecord(obj)) return false;
  for (const k of CANONICAL_SCREEN_KEYS) {
    if (!(k in obj)) return false;
  }
  return true;
}

function truncateForPrompt(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '\n…(truncated)';
}

function applyCanonicalServerOverrides(
  obj: Record<string, unknown>,
  screenshot: Record<string, unknown>,
  mergedAnalysis: Record<string, unknown>,
): void {
  obj.screenshot_id = String(screenshot.id);
  obj.user_id = String(screenshot.user_id);
  const cap = screenshot.captured_at;
  obj.timestamp = typeof cap === 'string' ? cap : new Date().toISOString();

  const ap = Number(screenshot.activity_percent);
  const clicks = Number(screenshot.mouse_clicks ?? 0);
  const keys = Number(screenshot.keystrokes ?? 0);
  const moves = Number(screenshot.mouse_movements ?? 0);
  let interaction: string = 'none';
  if (keys > 0 && (clicks > 0 || moves > 0)) interaction = 'both';
  else if (keys > 0) interaction = 'keyboard';
  else if (clicks > 0 || moves > 0) interaction = 'mouse';

  if (isRecord(obj.activity_status)) {
    const a = obj.activity_status as Record<string, unknown>;
    if (!Number.isFinite(Number(ap)) || ap >= 15) {
      a.user_activity = a.user_activity || 'active';
    } else {
      a.user_activity = a.user_activity || 'idle';
    }
    a.interaction_type = interaction;
  }

  if (typeof obj.confidence_score !== 'number' || !Number.isFinite(obj.confidence_score)) {
    const cs = Number(mergedAnalysis.confidence_score);
    obj.confidence_score = Number.isFinite(cs) ? Math.max(0, Math.min(1, cs > 1 ? cs / 100 : cs)) : 0.5;
  } else if (obj.confidence_score > 1) {
    obj.confidence_score = Math.max(0, Math.min(1, (obj.confidence_score as number) / 100));
  }
}

function buildCanonicalScreenAnalysisPrompt(contextBlock: string): string {
  return `You classify a single employee desktop screenshot for workforce analytics.

Return ONLY one JSON object (no markdown). Use response keys exactly as specified. Prefer enum values shown with | where given; if uncertain use "Other".

Required top-level keys (all required):
- screenshot_id: string (UUID echoed from input)
- timestamp: string ISO 8601 (echo from input)
- user_id: string (echo from input)
- device: { type: "desktop" | "laptop" | "tablet" | "mobile" | "Other", os: "macOS" | "Windows" | "Linux" | "Android" | "iOS" | "Other", browser: "Chrome" | "Firefox" | "Safari" | "Edge" | "Other", resolution: string }
- screen_category: "Work" | "Gaming" | "Browsing" | "Communication" | "Social Media" | "Entertainment" | "Other"
- application: { name: string, category: "IDE" | "Gaming" | "Social Media" | "Entertainment" | "Communication" | "Browsing" | "Work" | "Other" }
- screen_content: { title: string, url: string, keywords: string[], visible_elements: string[] }
- activity_status: { user_activity: "active" | "idle", interaction_type: "keyboard" | "mouse" | "both" | "none", focus_level: "focused" | "distracted" | "idle" }
- task_alignment: { relevant_to_work: "yes" | "no", alignment_score: number 0-1, evidence: string[] }
- video_audio: { audio_playing: "yes" | "no", video_playing: "yes" | "no", video_type: "gaming" | "educational" | "leisure" | "meeting" | "tutorial" | "Other" }
- privacy_flags: { sensitive_data: "none" | "partial" | "full", personal_info_exposed: "yes" | "no", activity_sensitivity: "low" | "medium" | "high" }
- distraction_risk: { gaming: "yes" | "no", entertainment: "yes" | "no", social_media: "yes" | "no", news: "yes" | "no", shopping: "yes" | "no", other_distractions: string[] }
- task_relevance: { coding_related: "yes" | "no", meeting_related: "yes" | "no", design_related: "yes" | "no", administrative: "yes" | "no", research_related: "yes" | "no", email_related: "yes" | "no", communication_related: "yes" | "no" }
- distraction_level: { low: string, medium: string, high: string }  // For this screenshot: one sentence rationale on the matching tier; other two tiers use "-" or empty string.
- confidence_score: number 0-1
- recommendation: "Work mode" | "Possible distraction" | "Monitor" | "Idle time detected" | "Potential issue detected"
- metadata: { image_quality: "high" | "medium" | "low", noise_level: "low" | "medium" | "high", image_resolution: "high" | "low" | "medium" }

Context (metadata + prior signals — you may not see pixels):
${contextBlock}`;
}

async function generateCanonicalScreenAnalysisDeepSeek(
  token: string,
  textModel: string,
  ctx: {
    screenshot: Record<string, unknown>;
    mergedAnalysis: Record<string, unknown>;
    screenshotIntelligence: unknown;
    visualSceneTranscript: string;
    imageDescription: string | null;
    windowTitle: string;
    appName: string;
    url: string;
  },
): Promise<
  | { success: true; obj: Record<string, unknown>; usage?: ReturnType<typeof extractOpenAiUsage> }
  | { success: false; error: string; usage?: ReturnType<typeof extractOpenAiUsage> }
> {
  const intelStr = ctx.screenshotIntelligence != null
    ? truncateForPrompt(JSON.stringify(ctx.screenshotIntelligence), 12000)
    : '';
  const contextBlock = [
    `screenshot_id=${ctx.screenshot.id}`,
    `user_id=${ctx.screenshot.user_id}`,
    `captured_at=${ctx.screenshot.captured_at || ''}`,
    `activity_percent=${ctx.screenshot.activity_percent ?? ''}`,
    `focus_percent=${ctx.screenshot.focus_percent ?? ''}`,
    `mouse_clicks=${ctx.screenshot.mouse_clicks ?? 0} keystrokes=${ctx.screenshot.keystrokes ?? 0} mouse_movements=${ctx.screenshot.mouse_movements ?? 0}`,
    `window_title=${ctx.windowTitle || '(unknown)'}`,
    `app_name=${ctx.appName || '(unknown)'}`,
    `url=${ctx.url || '(unknown)'}`,
    `merged_category=${ctx.mergedAnalysis.category ?? ''}`,
    `merged_activity_type=${ctx.mergedAnalysis.activity_type ?? ''}`,
    `merged_is_work_related=${ctx.mergedAnalysis.is_work_related ?? ''}`,
    `merged_distraction_score=${ctx.mergedAnalysis.distraction_score ?? ''}`,
    ctx.imageDescription ? `image_summary=${truncateForPrompt(ctx.imageDescription, 2000)}` : '',
    ctx.visualSceneTranscript.trim()
      ? `visual_scene_transcript=${truncateForPrompt(ctx.visualSceneTranscript.trim(), 8000)}`
      : '',
    intelStr ? `screenshot_intelligence_json=${intelStr}` : '',
  ].filter(Boolean).join('\n');

  const prompt = buildCanonicalScreenAnalysisPrompt(contextBlock);

  try {
    const response = await fetch(getDeepSeekChatUrl(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: textModel,
        messages: [
          {
            role: 'system',
            content:
              'You output only valid JSON for canonical screenshot workforce analytics. Never use markdown fences.',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: screenAnalysisMaxTokens(),
        temperature: 0.2,
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      return { success: false as const, error: `${response.status}: ${await response.text()}` };
    }

    const result = await response.json() as Record<string, unknown>;
    const usage = extractOpenAiUsage(result);
    const content = String((result as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content || '');
    const slice = extractFirstJsonObject(content);
    if (!slice) return { success: false as const, error: 'canonical_unparseable', usage };
    let parsed: unknown;
    try {
      parsed = JSON.parse(slice);
    } catch {
      return { success: false as const, error: 'canonical_json_parse', usage };
    }
    if (!isValidCanonicalScreenAnalysis(parsed)) {
      return { success: false as const, error: 'canonical_missing_keys', usage };
    }
    return { success: true as const, obj: parsed as Record<string, unknown>, usage };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false as const, error: msg };
  }
}

async function executeCanonicalScreenAnalysisOnly(params: {
  supabase: ReturnType<typeof createClient>;
  corsHeaders: Record<string, string>;
  screenshot: Record<string, unknown>;
  textModelForRequest: string;
  visualSceneTranscript: string;
  requestBody: Record<string, unknown>;
}): Promise<Response> {
  const { supabase, corsHeaders, screenshot, textModelForRequest, visualSceneTranscript, requestBody } = params;
  const token = getTextApiToken();
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'DEEPSEEK_API_KEY not configured' }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
  if (Deno.env.get('SCREEN_ANALYSIS_DISABLED')?.toLowerCase() === 'true') {
    return new Response(
      JSON.stringify({ success: false, skipped: true, reason: 'SCREEN_ANALYSIS_DISABLED' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const titleToAnalyze = pickBestWindowTitle(requestBody.window_title, screenshot);
  const appToAnalyze = (requestBody.app_name as string) || String(screenshot.app_name || '');
  const pattern = analyzeScreenshotContent(titleToAnalyze, appToAnalyze);
  const aiMeta = screenshot.ai_metadata;
  const intel = isRecord(aiMeta) ? aiMeta.screenshot_intelligence : undefined;

  const gen = await generateCanonicalScreenAnalysisDeepSeek(token, textModelForRequest, {
    screenshot,
    mergedAnalysis: pattern,
    screenshotIntelligence: intel,
    visualSceneTranscript,
    imageDescription: typeof screenshot.ai_metadata === 'object' && screenshot.ai_metadata != null
      ? String((screenshot.ai_metadata as Record<string, unknown>).image_description || '').trim() || null
      : null,
    windowTitle: titleToAnalyze,
    appName: appToAnalyze,
    url: pickBestActiveUrl(screenshot),
  });

  if (gen.success === false) {
    console.warn('canonical_screen_analysis_only failed:', gen.error);
    return new Response(
      JSON.stringify({ success: false, error: gen.error }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  applyCanonicalServerOverrides(gen.obj, screenshot, pattern);

  const { error: upErr } = await supabase
    .from('screenshots')
    .update({ screen_analysis: gen.obj })
    .eq('id', screenshot.id);

  if (upErr) {
    console.error('screen_analysis update failed:', upErr);
    return new Response(
      JSON.stringify({ success: false, error: upErr.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      screen_analysis: gen.obj,
      analyzer_runtime_version: ANALYZER_RUNTIME_VERSION,
      deepseek_usage: gen.usage
        ? { screen_analysis: { ...gen.usage, model: textModelForRequest } }
        : undefined,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (!Deno.env.get('DEEPSEEK_API_KEY') && !_cachedDeepSeekKey) {
      await getDeepSeekKeyFromVault(supabase);
    }

    const deepseekConfigured =
      !!Deno.env.get('DEEPSEEK_API_KEY') || !!_cachedDeepSeekKey;

    const requestBody = await req.json();
    const textModelForRequest = pickDeepseekModel(requestBody.deepseek_model, envDefaultTextModel());
    const visionModelForRequest = pickDeepseekModel(
      requestBody.deepseek_vision_model ?? requestBody.deepseek_model,
      pickDeepseekModel(Deno.env.get('DEEPSEEK_VISION_MODEL'), textModelForRequest),
    );

    console.log(
      `[ai-screenshot-analyzer] deepseek_configured=${deepseekConfigured} text_model=${textModelForRequest} vision_model=${visionModelForRequest}`,
    );

    const {
      screenshot_id,
      user_id,
      window_title,
      app_name,
      use_ai = true, // Enable DeepSeek text analysis
      use_vision, // Enable vision analysis (auto-detected if not specified)
      create_alerts = true, // Enable alert creation
      force_vision = false, // Force vision analysis regardless of conditions
      force_ai = false, // Force AI text classification even if patterns are confident
      generate_description, // If true, run vision to generate a human-readable description
      /** Text description/OCR of the screen for DeepSeek chat (no pixels). */
      visual_scene_transcript,
      /** off | fallback | always — overrides SCREENSHOT_INTELLIGENCE_TEXT_MODE for this request. */
      screenshot_intelligence_text_mode,
    } = requestBody;

    const rawIntelMode = screenshot_intelligence_text_mode ?? Deno.env.get('SCREENSHOT_INTELLIGENCE_TEXT_MODE') ?? 'fallback';
    const intelligenceTextMode = (['off', 'fallback', 'always'].includes(String(rawIntelMode).toLowerCase())
      ? String(rawIntelMode).toLowerCase()
      : 'fallback') as 'off' | 'fallback' | 'always';
    const visualSceneTranscript = typeof visual_scene_transcript === 'string' ? visual_scene_transcript : '';

    if (!screenshot_id) {
      return new Response(
        JSON.stringify({ error: 'screenshot_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get screenshot data
    const { data: screenshot, error: screenshotError } = await supabase
      .from('screenshots')
      .select('*')
      .eq('id', screenshot_id)
      .single();

    if (screenshotError || !screenshot) {
      return new Response(
        JSON.stringify({ error: 'Screenshot not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (requestBody.canonical_screen_analysis_only === true) {
      return await executeCanonicalScreenAnalysisOnly({
        supabase,
        corsHeaders,
        screenshot,
        textModelForRequest,
        visualSceneTranscript,
        requestBody,
      });
    }

    console.log('🤖 Starting AI screenshot analysis for:', screenshot_id);

    const titleToAnalyze = pickBestWindowTitle(window_title, screenshot);
    const appToAnalyze = app_name || screenshot.app_name || '';
    const urlForIntelligence = pickBestActiveUrl(screenshot);
    const imageUrl = screenshot.image_url;
    const hasScreenshotImage = !!(
      String(screenshot.image_url || '').trim() || String(screenshot.file_path || '').trim()
    );

    // Fetch user's organization_id for alert scoping
    let userOrgId: string | null = screenshot.organization_id || null;
    if (!userOrgId && (user_id || screenshot.user_id)) {
      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user_id || screenshot.user_id)
        .single();
      userOrgId = userData?.organization_id || null;
    }
    
    // Step 1: Pattern-based analysis (fast, always runs first — needed before vision gate)
    let analysis = analyzeScreenshotContent(titleToAnalyze, appToAnalyze);
    let aiEnhanced = false;
    let visionResult = null;
    let textUsage: ReturnType<typeof extractOpenAiUsage> = undefined;
    let visionUsage: ReturnType<typeof extractOpenAiUsage> = undefined;
    let intelligenceTextUsage: ReturnType<typeof extractOpenAiUsage> = undefined;
    let serverSniffMeta: NonNullable<ReturnType<typeof sniffImageMeta>> | null = null;

    const textApiToken = getTextApiToken();
    const CONFIDENCE_THRESHOLD = 90;
    const patternConfident = analysis.confidence_score >= CONFIDENCE_THRESHOLD;

    // Determine if vision should be used (smart detection)
    let shouldUseVision = use_vision;
    let visionReason = '';
    
    if (shouldUseVision === undefined) {
      // Auto-detect when to use vision
      const activityPercent = screenshot.activity_percent || 0;
      const isUnvalidatedDuplicate = screenshot.is_duplicate && !screenshot.vision_validated_at;
      const alwaysVisionDescription = (Deno.env.get('ALWAYS_VISION_DESCRIPTION') || '').toLowerCase() === 'true';
      const wantsDescription = generate_description === true || alwaysVisionDescription;
      
      if (force_vision) {
        shouldUseVision = true;
        visionReason = 'forced';
      } else if (wantsDescription && hasScreenshotImage) {
        // Generate a description for the screenshot (vision) even if pattern is confident.
        // This is useful for UX, search, and auditability.
        shouldUseVision = true;
        visionReason = 'generate_description';
      } else if (screenshot.needs_vision_validation && !screenshot.vision_validated_at && !patternConfident) {
        // Only run vision for flagged screenshots when pattern confidence is low
        shouldUseVision = true;
        visionReason = 'flagged_for_validation';
      } else if (activityPercent < 10 && hasScreenshotImage && !patternConfident) {
        // Low activity AND ambiguous app — might be idle or just reading
        shouldUseVision = true;
        visionReason = 'low_activity';
      } else if (isUnvalidatedDuplicate && hasScreenshotImage && !patternConfident) {
        shouldUseVision = true;
        visionReason = 'unvalidated_duplicate';
      } else if (Math.random() < 0.03 && hasScreenshotImage) {
        // 3% random sampling for quality assurance
        shouldUseVision = true;
        visionReason = 'random_sample';
      } else {
        shouldUseVision = false;
      }
    } else {
      visionReason = 'explicit_request';
    }
    
    console.log(`Pattern confidence: ${analysis.confidence_score}% (${patternConfident ? 'HIGH - skip AI+vision' : 'LOW - may call AI'})`);
    console.log(`Vision analysis: ${shouldUseVision ? 'enabled' : 'disabled'} (reason: ${visionReason || 'not_needed'})`);

    // Step 2: AI-enhanced analysis (normally only when pattern matching is NOT confident)
    // If force_ai is true, always call AI when a token exists.
    if (use_ai && textApiToken && (!patternConfident || force_ai)) {
      // Check if same user+title was already AI-analyzed recently (dedup)
      let reusedClassification = false;
      if (titleToAnalyze) {
        try {
          const { data: recentSame } = await supabase
            .from('screenshots')
            .select('category, distraction_score, activity_type, ai_metadata')
            .eq('user_id', screenshot.user_id)
            .eq('window_title', titleToAnalyze)
            .eq('ai_analysis_status', 'completed')
            .gte('captured_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
            .neq('id', screenshot_id)
            .order('captured_at', { ascending: false })
            .limit(1);

          if (recentSame?.[0]?.ai_metadata?.analysis_method?.includes('ai')) {
            const prev = recentSame[0];
            analysis = {
              ...analysis,
              category: prev.category || analysis.category,
              distraction_score: prev.distraction_score ?? analysis.distraction_score,
              activity_type: prev.activity_type || analysis.activity_type,
              confidence_score: prev.ai_metadata?.confidence_score || analysis.confidence_score,
              is_work_related: prev.ai_metadata?.is_work_related ?? analysis.is_work_related,
              reasoning: [...analysis.reasoning, 'Reused recent AI classification for same title'],
              analysis_method: 'reused-ai',
              ai_model: prev.ai_metadata?.ai_model,
            };
            aiEnhanced = true;
            reusedClassification = true;
            console.log('♻️ Reusing recent AI classification for same title');
          }
        } catch (_e) { /* dedup lookup failed, proceed with fresh AI call */ }
      }

      if (!reusedClassification) {
        try {
          const aiResult = await analyzeWithAI(titleToAnalyze, appToAnalyze, textApiToken, textModelForRequest);
          if (aiResult.success) {
            analysis = mergeAnalysis(analysis, aiResult);
            aiEnhanced = true;
            if (aiResult.usage) textUsage = aiResult.usage;
            console.log('✅ AI analysis enhanced (deepseek)');
          }
        } catch (aiError: any) {
          console.warn('⚠️ AI analysis failed, using pattern-based only:', aiError.message);
        }
      }
    } else if (patternConfident) {
      console.log(`⏭️ Skipping AI: pattern confidence ${analysis.confidence_score}% >= ${CONFIDENCE_THRESHOLD}%`);
    }

    // Step 3: Vision analysis (skip if pattern is confident, unless specifically flagged)
    // Special reasons should bypass the "patternConfident" skip, including explicit user requests.
    const visionForSpecialReason = [
      'forced',
      'explicit_request',
      'generate_description',
      'flagged_for_validation',
      'low_activity',
      'unvalidated_duplicate',
    ].includes(visionReason);
    if (shouldUseVision && hasScreenshotImage && (!patternConfident || visionForSpecialReason)) {
      try {
        if (!textApiToken) {
          console.warn('⚠️ Vision was requested but DEEPSEEK_API_KEY is not configured');
          visionResult = { success: false, error: 'DEEPSEEK_API_KEY not configured' };
        } else {
          const resolvedVision = await resolveVisionImageInput(supabase, screenshot);
          if ('error' in resolvedVision) {
            visionResult = { success: false, error: resolvedVision.error };
          } else {
            console.log(`Vision image loaded via ${resolvedVision.source}`);
            const remoteVlUrl = await resolveRemoteImageUrlForVl(supabase, screenshot);
            const sniff =
              'imageBytes' in resolvedVision && resolvedVision.imageBytes
                ? sniffImageMeta(resolvedVision.imageBytes, resolvedVision.storagePath ?? screenshot.file_path)
                : null;
            serverSniffMeta = sniff;
            visionResult = await analyzeWithVision(resolvedVision.imageUrl, visionModelForRequest, {
              remoteHttpsImageUrl: remoteVlUrl,
              serverSniffMeta: sniff,
            });
            if (visionResult?.success && visionResult.screenshot_intelligence && serverSniffMeta) {
              visionResult.screenshot_intelligence = mergeServerMetaIntoIntelligence(
                visionResult.screenshot_intelligence as Record<string, unknown>,
                serverSniffMeta,
              );
            }
          }
        }
        if (visionResult?.usage) {
          visionUsage = visionResult.usage;
        }
        if (visionResult?.success) {
          // App-name override protection: known dev tools cannot be reclassified by vision
          const isProtectedApp = OVERRIDE_PROTECTED_APPS.some(a => appToAnalyze.toLowerCase().includes(a));
          if (isProtectedApp && visionResult.category && visionResult.category !== 'productive' && visionResult.category !== 'communication') {
            console.log(`🛡️ Override protection: ${appToAnalyze} stays ${analysis.category} (AI vision tried: ${visionResult.category})`);
            visionResult.category = analysis.category;
            visionResult.is_work_related = true;
          }

          analysis = mergeVisionAnalysis(analysis, visionResult);
          console.log(`✅ Vision analysis completed (reason: ${visionReason})`);
          
          if (screenshot.is_duplicate && visionResult.is_work_related) {
            const isLikelyFalsePositive = 
              (visionResult.confidence || 0) > 0.7 && 
              (visionResult.category === 'productive' || visionResult.is_work_related);
            
            if (isLikelyFalsePositive) {
              console.log('⚠️ Vision detected false positive duplicate - will unflag');
              analysis.duplicate_override = true;
              analysis.duplicate_override_reason = 'Vision validation: productive work content detected';
            }
          }
        }
      } catch (visionError: any) {
        console.warn('⚠️ Vision analysis failed:', visionError.message);
      }
    } else if (shouldUseVision && !hasScreenshotImage) {
      console.warn('⚠️ Vision skipped: no image_url or file_path on screenshot');
    } else if (shouldUseVision && patternConfident && !visionForSpecialReason) {
      console.log(`⏭️ Skipping vision: pattern confidence ${analysis.confidence_score}% >= ${CONFIDENCE_THRESHOLD}%`);
    }

    // Step 3b: DeepSeek text-only screenshot_intelligence (api.deepseek.com has no image input on chat).
    if (!serverSniffMeta && screenshot.file_path?.trim()) {
      const bytes = await downloadScreenshotBytesForMeta(supabase, screenshot);
      if (bytes) serverSniffMeta = sniffImageMeta(bytes, screenshot.file_path);
    }

    const visionHadIntelligence =
      !!visionResult?.success &&
      !!visionResult.screenshot_intelligence &&
      typeof visionResult.screenshot_intelligence === 'object';

    // `always` currently matches `fallback`: text JSON runs only when multimodal did not yield screenshot_intelligence.
    const shouldRunTextIntelligence =
      intelligenceTextMode !== 'off' && !!textApiToken && !visionHadIntelligence;

    if (shouldRunTextIntelligence) {
      try {
        const metaHint = serverSniffMeta
          ? `\nKnown from file bytes (use for meta.*): image_pixel_width=${serverSniffMeta.image_pixel_width}, image_pixel_height=${serverSniffMeta.image_pixel_height}, image_file_format_mime=${serverSniffMeta.image_file_format_mime}, aspect_ratio=${serverSniffMeta.aspect_ratio}` +
            (serverSniffMeta.approx_file_type_note
              ? `, approx_file_type_note=${JSON.stringify(serverSniffMeta.approx_file_type_note)}`
              : '')
          : '\nNo local image dimensions/MIME available; set meta fields cautiously or use null where allowed.';

        const tr = await analyzeScreenshotIntelligenceDeepSeekText(
          textApiToken,
          textModelForRequest,
          visualSceneTranscript,
          titleToAnalyze,
          appToAnalyze,
          urlForIntelligence,
          metaHint,
        );
        if (tr.success) {
          if (serverSniffMeta && tr.screenshot_intelligence) {
            tr.screenshot_intelligence = mergeServerMetaIntoIntelligence(
              tr.screenshot_intelligence as Record<string, unknown>,
              serverSniffMeta,
            );
          }
          visionResult = tr;
          if (tr.usage) intelligenceTextUsage = tr.usage;
          analysis = mergeVisionAnalysis(analysis, tr);
          console.log('✅ Screenshot intelligence (DeepSeek text-only) completed');
        } else {
          console.warn('⚠️ DeepSeek text intelligence skipped:', tr.error);
        }
      } catch (e: any) {
        console.warn('⚠️ DeepSeek text intelligence failed:', e?.message);
      }
    }

    // Step 4: Check for consecutive duplicates
    let consecutiveDuplicateCount = 0;
    if (screenshot.is_duplicate) {
      const { data: prevScreenshots } = await supabase
        .from('screenshots')
        .select('consecutive_duplicate_count')
        .eq('user_id', screenshot.user_id)
        .lt('captured_at', screenshot.captured_at)
        .order('captured_at', { ascending: false })
        .limit(1);

      if (prevScreenshots && prevScreenshots[0]) {
        consecutiveDuplicateCount = (prevScreenshots[0].consecutive_duplicate_count || 0) + 1;
      } else {
        consecutiveDuplicateCount = 1;
      }
    }

    // Step 5: Create alerts if needed
    let alertId = null;
    if (create_alerts) {
      alertId = await createAlertsIfNeeded(
        supabase,
        screenshot.user_id,
        screenshot_id,
        analysis,
        consecutiveDuplicateCount,
        visionResult,
        userOrgId
      );
    }

    // Step 6: Update screenshot with analysis results
    const intelligenceObj =
      visionResult?.success && visionResult.screenshot_intelligence &&
      typeof visionResult.screenshot_intelligence === 'object'
        ? (visionResult.screenshot_intelligence as Record<string, unknown>)
        : null;
    const hasVisionDescription =
      visionResult?.success &&
      (!!intelligenceObj ||
        (typeof visionResult.detected_content === 'string' && visionResult.detected_content.trim().length > 0));
    const isDeepseekTextIntelligence = visionResult?.vision_route === 'deepseek-text-intelligence';
    const pixelsVisionUsed = isMultimodalVisionResult(visionResult);
    const fallbackTextDescription = [
      appToAnalyze ? `App: ${appToAnalyze}` : '',
      titleToAnalyze ? `Window: ${titleToAnalyze}` : '',
      analysis?.activity_type ? `Activity: ${analysis.activity_type}` : '',
      analysis?.reasoning?.[0] ? `Hint: ${analysis.reasoning[0]}` : '',
      analysis?.reasoning?.[1] ? `Note: ${analysis.reasoning[1]}` : '',
    ]
      .filter(Boolean)
      .join(' | ')
      .trim();
    let imageDescription: string | null = intelligenceObj
      ? briefLineFromIntelligence(intelligenceObj)
      : hasVisionDescription && typeof visionResult?.detected_content === 'string'
        ? visionResult.detected_content.trim()
        : (fallbackTextDescription ||
            (aiEnhanced
              ? 'AI text classification only (vision did not run or is not supported for this model).'
              : null));
    if (!imageDescription && aiEnhanced) {
      imageDescription =
        'AI summary: classification completed without a text summary (check app/window fields on the row).';
    }

    let screenAnalysisUsage: ReturnType<typeof extractOpenAiUsage> = undefined;
    let screenAnalysisObj: Record<string, unknown> | null = null;
    if (textApiToken && Deno.env.get('SCREEN_ANALYSIS_DISABLED')?.toLowerCase() !== 'true') {
      const canon = await generateCanonicalScreenAnalysisDeepSeek(textApiToken, textModelForRequest, {
        screenshot,
        mergedAnalysis: analysis,
        screenshotIntelligence: intelligenceObj,
        visualSceneTranscript,
        imageDescription,
        windowTitle: titleToAnalyze,
        appName: appToAnalyze,
        url: urlForIntelligence,
      });
      if (canon.success === false) {
        console.warn('Canonical screen_analysis generation failed:', canon.error);
      } else {
        applyCanonicalServerOverrides(canon.obj, screenshot, analysis);
        screenAnalysisObj = canon.obj;
        screenAnalysisUsage = canon.usage;
      }
    }

    const deepseek_usage = buildDeepseekUsagePayload(
      textUsage,
      visionUsage,
      textModelForRequest,
      visionModelForRequest,
      intelligenceTextUsage,
      screenAnalysisUsage,
    );

    const visionErrStr = visionResult?.success
      ? null
      : (typeof visionResult?.error === 'string'
        ? visionResult.error
        : visionResult?.error != null
          ? JSON.stringify(visionResult.error)
          : null);

    /** Keys we set last — never let `...analysis` overwrite them (model JSON can reuse names). */
    const META_OUR_KEYS = new Set([
      'image_description',
      'screenshot_intelligence',
      'screenshot_intelligence_source',
      'analyzed_at',
      'analysis_version',
      'source',
      'ai_enhanced',
      'vision_used',
      'pixels_vision_used',
      'vision_reason',
      'vision_error',
      'description_source',
      'deepseek_usage',
      'analyzer_meta_version',
    ]);
    const analysisForMeta = Object.fromEntries(
      Object.entries(analysis as Record<string, unknown>).filter(([k]) => !META_OUR_KEYS.has(k)),
    );

    const updateData: any = {
      ai_analysis_status: 'completed',
      category: analysis.category,
      distraction_score: analysis.distraction_score,
      confidence_score: analysis.confidence_score,
      activity_type: analysis.activity_type,
      ai_analyzed_at: new Date().toISOString(),
      ai_model_used: aiEnhanced ? (analysis.ai_model || textModelForRequest) : 'pattern-based',
      is_work_related: !ALERT_CATEGORIES.includes(analysis.category),
      consecutive_duplicate_count: consecutiveDuplicateCount,
      ai_metadata: {
        ...analysisForMeta,
        image_description: imageDescription,
        analyzed_at: new Date().toISOString(),
        analysis_version: ANALYZER_RUNTIME_VERSION,
        source: 'ai-screenshot-analyzer',
        ai_enhanced: aiEnhanced,
        vision_used: pixelsVisionUsed,
        pixels_vision_used: pixelsVisionUsed,
        vision_reason: visionReason,
        vision_error: visionErrStr,
        description_source: hasVisionDescription
          ? (isDeepseekTextIntelligence ? 'screenshot_intelligence_text' : 'vision')
          : 'text-fallback',
        screenshot_intelligence_source: intelligenceObj
          ? (isDeepseekTextIntelligence ? 'deepseek_text' : 'multimodal')
          : undefined,
        analyzer_meta_version: 2,
        ...(deepseek_usage ? { deepseek_usage } : {}),
        ...(intelligenceObj ? { screenshot_intelligence: intelligenceObj } : {}),
      }
    };

    if (imageDescription && !hasVisionDescription) {
      updateData.vision_content = imageDescription;
    }

    // Update vision-specific fields if vision was used
    if (visionResult?.success) {
      updateData.vision_analysis = visionResult;
      updateData.vision_content = visionResult.detected_content;
      updateData.vision_validated_at = new Date().toISOString();
      updateData.vision_category = visionResult.category || analysis.category;
      updateData.vision_confidence = visionResult.confidence || (analysis.confidence_score / 100);
      updateData.vision_detected_content = visionResult.detected_content;
      updateData.needs_vision_validation = false; // Clear the flag
      
      // Store privacy concerns from vision
      if (visionResult.privacy_concerns && visionResult.privacy_concerns.length > 0) {
        updateData.vision_privacy_concerns = visionResult.privacy_concerns;
      }
      
      // Handle duplicate override from vision
      if (analysis.duplicate_override) {
        updateData.is_duplicate = false;
        updateData.duplicate_reason = analysis.duplicate_override_reason;
      }
    }

    if (alertId) {
      updateData.alert_id = alertId;
    }

    if (screenAnalysisObj) {
      updateData.screen_analysis = screenAnalysisObj;
    }

    const { error: updateError } = await supabase
      .from('screenshots')
      .update(updateData)
      .eq('id', screenshot_id);

    if (updateError) {
      console.error('Failed to update screenshot:', updateError);
      throw updateError;
    }

    console.log('✅ Screenshot analysis completed', {
      category: analysis.category,
      aiEnhanced,
      visionUsed: pixelsVisionUsed,
      screenshotIntelligenceText: isDeepseekTextIntelligence,
      visionReason: visionReason,
      imageDescription,
      alertCreated: !!alertId,
      consecutiveDuplicates: consecutiveDuplicateCount,
      duplicateOverride: analysis.duplicate_override || false,
      screen_analysis: !!screenAnalysisObj,
    });

    return new Response(
      JSON.stringify({
        success: true,
        analysis,
        ai_enhanced: aiEnhanced,
        vision_result: visionResult,
        vision_reason: visionReason,
        vision_used: pixelsVisionUsed,
        pixels_vision_used: pixelsVisionUsed,
        image_description: imageDescription,
        description_source: hasVisionDescription
          ? (isDeepseekTextIntelligence ? 'screenshot_intelligence_text' : 'vision')
          : 'text-fallback',
        screenshot_intelligence_source: intelligenceObj
          ? (isDeepseekTextIntelligence ? 'deepseek_text' : 'multimodal')
          : undefined,
        vision_error: visionErrStr,
        analyzer_runtime_version: ANALYZER_RUNTIME_VERSION,
        alert_id: alertId,
        consecutive_duplicate_count: consecutiveDuplicateCount,
        duplicate_override: analysis.duplicate_override || false,
        deepseek_usage,
        screenshot_intelligence: intelligenceObj ?? undefined,
        screen_analysis: screenAnalysisObj ?? undefined,
        message: 'Screenshot analysis completed successfully'
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error: any) {
    console.error('Error in screenshot analysis:', error);

    return new Response(
      JSON.stringify({
        error: 'Analysis failed',
        type: 'screenshot_analysis_error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

/**
 * Company/work domain whitelist -- titles containing these are always productive
 */
const COMPANY_WORK_DOMAINS = [
  'mzad', 'mzady', 'syaanh', 'rentcarz', 'rentelly', 'ebdaa',
  'admin panel', 'admin dashboard', 'zoho', 'workdrive',
  'supabase', 'vercel', 'cloudflare', 'bitbucket', 'jira',
  'confluence', 'notion', 'linear', 'figma.com',
  'localhost', '127.0.0.1', 'staging.', 'dev.',
];

/**
 * Apps whose pattern classification cannot be overridden by AI vision
 */
const OVERRIDE_PROTECTED_APPS = [
  'cursor', 'code', 'xcode', 'phpstorm', 'webstorm', 'intellij',
  'android studio', 'postman', 'terminal', 'iterm', 'figma',
  'photoshop', 'illustrator', 'excel', 'word', 'powerpoint',
  'sublime', 'vim', 'neovim', 'emacs', 'atom', 'pycharm',
  'goland', 'rider', 'clion', 'rubymine', 'datagrip',
];

/**
 * Pattern-based analysis (fast, reliable fallback)
 */
function analyzeScreenshotContent(windowTitle: string, appName: string): any {
  const title = (windowTitle || '').toLowerCase();
  const app = (appName || '').toLowerCase();

  let category = 'productive';
  let activityType = 'work';
  let distractionScore = 0;
  let confidenceScore = 50;
  let reasoning: string[] = [];
  let tags: string[] = ['screenshot', 'ai-analysis'];
  let isWorkRelated = true;

  // Handle empty/unknown inputs -- lowest confidence
  if (!title && !app) {
    confidenceScore = 30;
    reasoning.push('No window title or app name available');
    return {
      category, activity_type: activityType, distraction_score: distractionScore,
      confidence_score: confidenceScore, reasoning, tags,
      privacy_risk_score: 0, privacy_concerns: [],
      meeting_detected: false, is_work_related: isWorkRelated,
      productivity_score: 50,
      analysis_method: 'pattern-based',
      window_title_analyzed: windowTitle, app_name_analyzed: appName
    };
  }

  // --- Company/work URL whitelist (highest priority) ---
  const isCompanyWork = COMPANY_WORK_DOMAINS.some(d => title.includes(d));
  if (isCompanyWork) {
    category = 'productive';
    confidenceScore = 95;
    activityType = 'company-work';
    distractionScore = 5;
    reasoning.push('Company/work domain detected in title');
    tags.push('company-work');
    isWorkRelated = true;
  }

  // --- Browser-based detection ---
  const isBrowser = title.includes('chrome') || title.includes('firefox') || title.includes('safari') ||
                    title.includes('edge') || app.includes('chrome') || app.includes('firefox') ||
                    app.includes('safari') || app.includes('opera') || app.includes('brave') ||
                    app.includes('arc') || app.includes('vivaldi');

  if (isBrowser && !isCompanyWork) {
    if (title.includes('gmail') || title.includes('outlook') || title.includes('mail')) {
      category = 'productive';
      activityType = 'email';
      distractionScore = 10;
      confidenceScore = 92;
      reasoning.push('Email client detected');
      tags.push('email', 'communication');
    } else if (title.includes('slack') || title.includes('teams') || title.includes('discord') || title.includes('cliq')) {
      category = 'communication';
      activityType = 'communication';
      distractionScore = 20;
      confidenceScore = 92;
      reasoning.push('Team communication tool detected');
      tags.push('communication', 'collaboration');
    } else if (title.includes('youtube')) {
      if (title.includes('tutorial') || title.includes('course') || title.includes('learn') || 
          title.includes('how to') || title.includes('programming') || title.includes('coding')) {
        category = 'productive';
        activityType = 'learning';
        distractionScore = 15;
        confidenceScore = 92;
        reasoning.push('Educational YouTube content detected');
        tags.push('learning', 'youtube');
      } else {
        category = 'entertainment';
        activityType = 'media';
        distractionScore = 75;
        confidenceScore = 92;
        reasoning.push('YouTube entertainment detected');
        tags.push('entertainment', 'youtube');
        isWorkRelated = false;
      }
    } else if (title.includes('netflix') || title.includes('hulu') || title.includes('disney') || title.includes('twitch')) {
      category = 'entertainment';
      activityType = 'media';
      distractionScore = 85;
      confidenceScore = 95;
      reasoning.push('Streaming platform detected');
      tags.push('entertainment', 'streaming');
      isWorkRelated = false;
    } else if (title.includes('facebook') || title.includes('instagram') || title.includes('twitter') || 
               title.includes('tiktok') || title.includes('reddit') || title.includes('snapchat') ||
               title.includes('pinterest')) {
      category = 'social_media';
      activityType = 'social';
      distractionScore = 70;
      confidenceScore = 95;
      reasoning.push('Social media platform detected');
      tags.push('social-media');
      isWorkRelated = false;
    } else if (title.includes('github') || title.includes('gitlab') || title.includes('stackoverflow') || 
               title.includes('dev.to') || title.includes('docs') || title.includes('npm') ||
               title.includes('crates.io') || title.includes('pypi') || title.includes('mdn')) {
      category = 'productive';
      activityType = 'development';
      distractionScore = 5;
      confidenceScore = 92;
      reasoning.push('Development platform detected');
      tags.push('development', 'coding');
    } else if (title.includes('amazon.com') || title.includes('ebay.com') || title.includes('shopping cart') || 
               title.includes('walmart.com') || title.includes('aliexpress') || title.includes('etsy.com') ||
               title.includes('noon.com') || title.includes('shein')) {
      category = 'shopping';
      activityType = 'shopping';
      distractionScore = 60;
      confidenceScore = 92;
      reasoning.push('Shopping website detected');
      tags.push('shopping');
      isWorkRelated = false;
    } else {
      category = 'productive';
      activityType = 'web-browsing';
      distractionScore = 25;
      confidenceScore = 60;
      reasoning.push('General web browsing');
      tags.push('browsing');
    }
  }

  // --- Application-based detection (higher priority, overrides browser) ---
  if (app.includes('cursor') || app.includes('code') || app.includes('studio') || app.includes('xcode') || 
      app.includes('vim') || app.includes('neovim') || app.includes('emacs') || app.includes('sublime') || 
      app.includes('atom') || app.includes('phpstorm') || app.includes('webstorm') || app.includes('intellij') || 
      app.includes('pycharm') || app.includes('goland') || app.includes('rider') || app.includes('clion') || 
      app.includes('rubymine') || app.includes('datagrip') || app.includes('android studio')) {
    category = 'productive';
    activityType = 'development';
    distractionScore = 5;
    reasoning.push('Development IDE detected');
    tags.push('development', 'coding');
    confidenceScore = 95;
    isWorkRelated = true;
  } else if (app.includes('postman') || app.includes('insomnia') || app.includes('httpie')) {
    category = 'productive';
    activityType = 'api-testing';
    distractionScore = 5;
    reasoning.push('API testing tool detected');
    tags.push('development', 'api-testing');
    confidenceScore = 95;
    isWorkRelated = true;
  } else if (app.includes('terminal') || app.includes('iterm') || app.includes('warp') || 
             app.includes('hyper') || app.includes('windows terminal') || app.includes('powershell') ||
             app.includes('cmd.exe') || app.includes('command prompt')) {
    category = 'productive';
    activityType = 'terminal';
    distractionScore = 5;
    reasoning.push('Terminal/CLI detected');
    tags.push('development', 'terminal');
    confidenceScore = 95;
    isWorkRelated = true;
  } else if (app.includes('simulator') || app.includes('emulator') || app.includes('qemu')) {
    category = 'productive';
    activityType = 'device-testing';
    distractionScore = 5;
    reasoning.push('Device simulator/emulator detected');
    tags.push('development', 'testing');
    confidenceScore = 95;
    isWorkRelated = true;
  } else if (app.includes('docker') || app.includes('podman') || app.includes('kubernetes')) {
    category = 'productive';
    activityType = 'devops';
    distractionScore = 5;
    reasoning.push('Container/DevOps tool detected');
    tags.push('development', 'devops');
    confidenceScore = 95;
    isWorkRelated = true;
  } else if (app.includes('excel') || app.includes('sheets') || app.includes('numbers') || app.includes('calc')) {
    category = 'productive';
    activityType = 'spreadsheet';
    distractionScore = 10;
    reasoning.push('Spreadsheet application detected');
    tags.push('spreadsheet', 'data');
    confidenceScore = 95;
    isWorkRelated = true;
  } else if (app.includes('word') || app.includes('docs') || app.includes('pages') || app.includes('writer') ||
             app.includes('notepad') || app.includes('notes')) {
    category = 'productive';
    activityType = 'document';
    distractionScore = 10;
    reasoning.push('Document editor detected');
    tags.push('document', 'writing');
    confidenceScore = 95;
    isWorkRelated = true;
  } else if (app.includes('photoshop') || app.includes('illustrator') || app.includes('figma') || 
             app.includes('sketch') || app.includes('canva') || app.includes('affinity') ||
             app.includes('gimp') || app.includes('inkscape')) {
    category = 'productive';
    activityType = 'design';
    distractionScore = 15;
    reasoning.push('Design software detected');
    tags.push('design', 'creative');
    confidenceScore = 95;
    isWorkRelated = true;
  } else if (app.includes('zoom') || app.includes('meet') || app.includes('teams') || app.includes('webex') ||
             app.includes('skype')) {
    category = 'productive';
    activityType = 'meeting';
    distractionScore = 25;
    reasoning.push('Video conferencing detected');
    tags.push('meeting', 'communication');
    confidenceScore = 95;
    isWorkRelated = true;
  } else if (app.includes('cliq') || app.includes('zoho')) {
    category = 'communication';
    activityType = 'communication';
    distractionScore = 15;
    reasoning.push('Zoho/Cliq communication tool detected');
    tags.push('communication', 'collaboration');
    confidenceScore = 95;
    isWorkRelated = true;
  } else if (app.includes('slack') || app.includes('telegram') || app.includes('signal')) {
    category = 'communication';
    activityType = 'communication';
    distractionScore = 20;
    reasoning.push('Messaging app detected');
    tags.push('communication');
    confidenceScore = 95;
    isWorkRelated = true;
  } else if (app.includes('whatsapp')) {
    category = 'communication';
    activityType = 'communication';
    distractionScore = 30;
    reasoning.push('WhatsApp detected');
    tags.push('communication');
    confidenceScore = 92;
    isWorkRelated = true;
  } else if (app.includes('claude') || app.includes('chatgpt') || app.includes('copilot') ||
             app.includes('openai') || app.includes('gemini')) {
    category = 'productive';
    activityType = 'ai-assistant';
    distractionScore = 10;
    reasoning.push('AI assistant tool detected');
    tags.push('ai', 'productive');
    confidenceScore = 95;
    isWorkRelated = true;
  } else if (app.includes('anydesk') || app.includes('teamviewer') || app.includes('remote desktop') ||
             app.includes('vnc') || app.includes('parsec')) {
    category = 'productive';
    activityType = 'remote-access';
    distractionScore = 10;
    reasoning.push('Remote access tool detected');
    tags.push('remote', 'productive');
    confidenceScore = 95;
    isWorkRelated = true;
  } else if (app.includes('file explorer') || app.includes('finder') || app.includes('explorer.exe') ||
             app.includes('nautilus') || app.includes('dolphin') || app.includes('thunar')) {
    category = 'productive';
    activityType = 'file-management';
    distractionScore = 5;
    reasoning.push('File manager detected');
    tags.push('file-management', 'productive');
    confidenceScore = 95;
    isWorkRelated = true;
  } else if (app.includes('opera') || app.includes('brave') || app.includes('arc') || app.includes('vivaldi')) {
    if (!isBrowser) {
      category = 'productive';
      activityType = 'web-browsing';
      distractionScore = 25;
      confidenceScore = 60;
      reasoning.push('Browser detected (app-based)');
      tags.push('browsing');
    }
  } else if (app.includes('steam') || app.includes('epic games') || app.includes('battle.net') || 
             app.includes('minecraft') || app.includes('roblox') || app.includes('fortnite') ||
             app.includes('valorant') || app.includes('league of legends') || app.includes('origin') ||
             app.includes('genshin') || app.includes('riot')) {
    category = 'gaming';
    activityType = 'gaming';
    distractionScore = 95;
    reasoning.push('Gaming application detected');
    tags.push('gaming');
    confidenceScore = 95;
    isWorkRelated = false;
  } else if (app.includes('spotify') || app.includes('apple music') || app.includes('youtube music') ||
             app.includes('media player') || app.includes('vlc') || app.includes('itunes')) {
    category = 'entertainment';
    activityType = 'music';
    distractionScore = 35;
    reasoning.push('Music/media player detected');
    tags.push('music');
    confidenceScore = 92;
    isWorkRelated = true;
  } else if (app.includes('powerpoint') || app.includes('keynote') || app.includes('impress')) {
    category = 'productive';
    activityType = 'presentation';
    distractionScore = 10;
    reasoning.push('Presentation software detected');
    tags.push('presentation', 'productive');
    confidenceScore = 95;
    isWorkRelated = true;
  }

  // Privacy detection
  let privacyRiskScore = 0;
  let privacyConcerns: string[] = [];

  if (title.includes('password') || title.includes('login') || title.includes('signin') || title.includes('2fa')) {
    privacyRiskScore = 60;
    privacyConcerns.push('Authentication page detected');
    tags.push('privacy-sensitive');
  }

  if (title.includes('bank') || title.includes('paypal') || title.includes('stripe') || 
      title.includes('venmo') || title.includes('financial')) {
    privacyRiskScore = 80;
    privacyConcerns.push('Financial application detected');
    tags.push('financial', 'privacy-sensitive');
  }

  // Meeting detection
  const meetingDetected = title.includes('meeting') || title.includes('call') || 
                          title.includes('conference') || app.includes('zoom') || 
                          app.includes('meet') || app.includes('teams');

  const productivityScore = Math.max(0, Math.min(100, 100 - distractionScore));

  return {
    category,
    activity_type: activityType,
    distraction_score: distractionScore,
    confidence_score: confidenceScore,
    reasoning,
    tags,
    privacy_risk_score: privacyRiskScore,
    privacy_concerns: privacyConcerns,
    meeting_detected: meetingDetected,
    is_work_related: isWorkRelated,
    productivity_score: productivityScore,
    analysis_method: 'pattern-based',
    window_title_analyzed: windowTitle,
    app_name_analyzed: appName
  };
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** OpenAI-compatible usage object from DeepSeek chat/completions response */
function extractOpenAiUsage(result: Record<string, unknown> | null | undefined): {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
} | undefined {
  const u = result?.usage as Record<string, unknown> | undefined;
  if (!u || typeof u !== 'object') return undefined;
  const pt = Number(u.prompt_tokens);
  const ct = Number(u.completion_tokens);
  const tt = Number(u.total_tokens);
  if (!Number.isFinite(tt) && !Number.isFinite(pt) && !Number.isFinite(ct)) return undefined;
  const prompt_tokens = Number.isFinite(pt) ? pt : 0;
  const completion_tokens = Number.isFinite(ct) ? ct : 0;
  const total_tokens = Number.isFinite(tt) ? tt : prompt_tokens + completion_tokens;
  return { prompt_tokens, completion_tokens, total_tokens };
}

function buildDeepseekUsagePayload(
  text: ReturnType<typeof extractOpenAiUsage>,
  vision: ReturnType<typeof extractOpenAiUsage>,
  textModel: string,
  visionModel: string,
  intelligenceText?: ReturnType<typeof extractOpenAiUsage>,
  screenAnalysis?: ReturnType<typeof extractOpenAiUsage>,
): Record<string, unknown> | undefined {
  const textPart = text ? { ...text, model: textModel } : undefined;
  const visionPart = vision ? { ...vision, model: visionModel } : undefined;
  const intelPart = intelligenceText ? { ...intelligenceText, model: textModel } : undefined;
  const screenPart = screenAnalysis ? { ...screenAnalysis, model: textModel } : undefined;
  const total_tokens =
    (text?.total_tokens ?? 0) +
    (vision?.total_tokens ?? 0) +
    (intelligenceText?.total_tokens ?? 0) +
    (screenAnalysis?.total_tokens ?? 0);
  if (!textPart && !visionPart && !intelPart && !screenPart) return undefined;
  return {
    text: textPart,
    vision: visionPart,
    screenshot_intelligence_text: intelPart,
    screen_analysis: screenPart,
    total_tokens,
  };
}

/**
 * DeepSeek VL: POST { image_url, prompt } — not OpenAI chat format.
 * Response shape: { id?, model?, output: string | object }
 */
async function visionDeepSeekVlApi(
  endpoint: string,
  token: string,
  imageUrl: string,
  prompt: string,
): Promise<any> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_url: imageUrl,
      prompt,
      output_format: 'text',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { success: false, error: `${response.status}: ${errorText}` };
  }

  let result: Record<string, unknown>;
  try {
    result = await response.json() as Record<string, unknown>;
  } catch {
    return { success: false, error: 'DeepSeek VL: invalid JSON response' };
  }

  const out = result.output;
  const text = typeof out === 'string' ? out : (out != null ? JSON.stringify(out) : '');
  const model = typeof result.model === 'string' ? result.model : 'deepseek-vl';
  const parsed = parseVisionJsonPayload(text, model);
  if (parsed.success) {
    return { ...parsed, vision_route: 'deepseek-vl' as const };
  }
  return {
    success: true,
    detected_content: text.trim().substring(0, 500),
    model,
    vision_route: 'deepseek-vl' as const,
  };
}

function parseLegacyVisionShape(parsed: Record<string, unknown>, model: string, fallbackText: string): any {
  const validCategories = ['productive', 'social_media', 'entertainment', 'gaming', 'shopping', 'communication', 'other'];
  const cat = typeof parsed.category === 'string' ? parsed.category : '';
  const prod =
    typeof parsed.productivity_score === 'number' ? clampScore(parsed.productivity_score) : undefined;
  return {
    success: true as const,
    detected_content: String(parsed.detected_content || fallbackText).substring(0, 500),
    category: validCategories.includes(cat) ? cat : undefined,
    is_work_related: parsed.is_work_related,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
    privacy_concerns: Array.isArray(parsed.privacy_concerns) ? parsed.privacy_concerns : [],
    is_idle: parsed.is_idle || false,
    productivity_score: prod,
    distraction_score: typeof parsed.distraction_score === 'number' ? clampScore(parsed.distraction_score) : undefined,
    model,
  };
}

function parseVisionJsonPayload(text: string, model: string): any {
  const slice = extractFirstJsonObject(text);
  if (!slice) return { success: false as const, error: 'unparseable' };
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(slice);
  } catch {
    return { success: false as const, error: 'json_parse' };
  }
  if (isScreenshotIntelligenceShape(parsed)) {
    return normalizeIntelligenceVisionPayload(coerceScreenshotIntelligenceShape(parsed), model);
  }
  if (typeof parsed.detected_content === 'string' || typeof parsed.category === 'string') {
    return parseLegacyVisionShape(parsed, model, text);
  }
  return { success: false as const, error: 'unparseable' };
}

async function visionOpenAiMultimodal(
  apiUrl: string,
  token: string,
  model: string,
  imageUrl: string,
  prompt: string,
  extra: Record<string, unknown> = {},
): Promise<any> {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      max_tokens: visionJsonMaxTokens(),
      temperature: 0.2,
      ...extra,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    // DeepSeek text-only models (eg v4 flash/pro on chat/completions) reject image blocks.
    if (
      response.status === 400 &&
      /unknown variant [`'"]image_url[`'"]|expected [`'"]text[`'"]/i.test(errorText)
    ) {
      return {
        success: false,
        error:
          `Model ${model} on ${apiUrl} rejected image input. ` +
          `This endpoint/model appears text-only for chat/completions. ` +
          `Use a vision-capable model/endpoint, or keep text fallback description.`,
      };
    }
    return { success: false, error: `${response.status}: ${errorText}` };
  }

  const result = await response.json();
  const usage = extractOpenAiUsage(result as Record<string, unknown>);
  const text = result.choices?.[0]?.message?.content || '';
  const parsed = parseVisionJsonPayload(text, model);
  if (parsed.success) return { ...parsed, usage };

  return {
    success: true,
    detected_content: text.substring(0, 500),
    model,
    usage,
  };
}

function pixelSourceFromVisionRoute(route: string | undefined): IntelligencePixelSource | null {
  if (route === 'openai-compatible') return 'openai_compatible';
  if (route === 'deepseek-vl') return 'deepseek_vl';
  return null;
}

/** Set analysis_method_note for pixel-grounded multimodal results. */
function finalizeVisionResultIntelligence(r: Record<string, unknown>): void {
  if (!r?.success || !r.screenshot_intelligence || typeof r.screenshot_intelligence !== 'object') return;
  const route = typeof r.vision_route === 'string' ? r.vision_route : undefined;
  r.screenshot_intelligence = finalizeIntelligenceObject(r.screenshot_intelligence as Record<string, unknown>, {
    pixelSource: pixelSourceFromVisionRoute(route),
  });
}

async function downloadScreenshotBytesForMeta(supabase: any, screenshot: { file_path?: string | null }): Promise<Uint8Array | null> {
  const path = screenshot.file_path?.trim();
  if (!path) return null;
  const bucket = screenshotsBucket();
  const { data: blob, error } = await supabase.storage.from(bucket).download(path);
  if (error || !blob) return null;
  try {
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * DeepSeek chat/completions — text-only JSON intelligence (no image). Uses response_format json_object.
 */
async function analyzeScreenshotIntelligenceDeepSeekText(
  token: string,
  textModel: string,
  transcript: string,
  windowTitle: string,
  appName: string,
  activeUrl: string,
  serverMetaHint: string,
): Promise<any> {
  const transcriptBlock = [
    transcript.trim()
      ? `Visual scene transcript (from agent, OCR, or user):\n${transcript.trim()}`
      : 'Visual scene transcript: not provided.',
    `Window title (metadata): ${windowTitle || '(unknown)'}`,
    `Application name (metadata): ${appName || '(unknown)'}`,
    `Active/focus URL if captured (metadata): ${activeUrl || '(unknown)'}`,
  ].join('\n\n');

  const prompt = buildScreenshotIntelligenceTextPrompt(transcriptBlock, serverMetaHint);

  const response = await fetch(getDeepSeekChatUrl(), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: textModel,
      messages: [
        {
          role: 'system',
          content:
            'You output only valid JSON for workforce screenshot analytics. Never use markdown code fences. Obey the user schema exactly.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: intelligenceTextMaxTokens(),
      temperature: 0.2,
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    return { success: false, error: `${response.status}: ${await response.text()}` };
  }

  const result = await response.json();
  const usage = extractOpenAiUsage(result as Record<string, unknown>);
  const content = String((result as any).choices?.[0]?.message?.content || '');
  const slice = extractFirstJsonObject(content);
  if (!slice) return { success: false, error: 'intelligence_text_unparseable' };
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(slice);
  } catch {
    return { success: false, error: 'intelligence_text_json_parse' };
  }
  if (!isScreenshotIntelligenceShape(parsed)) {
    return { success: false, error: 'intelligence_text_missing_schema_keys' };
  }
  const finalized = finalizeIntelligenceObject(coerceScreenshotIntelligenceShape(parsed), {
    textOnly: true,
    transcriptSupplied: transcript.trim().length > 0,
  });
  const norm = normalizeIntelligenceVisionPayload(finalized, textModel);
  return { ...norm, usage, vision_route: 'deepseek-text-intelligence' as const };
}

/**
 * Vision: try DeepSeek VL (/v1/vision) when a fetchable URL exists, then optional OpenAI-compatible API, then DeepSeek chat (often text-only).
 */
async function analyzeWithVision(
  imageUrl: string,
  visionModelId: string,
  opts?: { remoteHttpsImageUrl?: string | null; serverSniffMeta?: ReturnType<typeof sniffImageMeta> | null },
): Promise<any> {
  try {
    const sniff = opts?.serverSniffMeta;
    const serverHint = sniff
      ? `\nKnown from uploaded file bytes (use these exact values in meta for width, height, MIME, aspect_ratio; trust over guessing): image_pixel_width=${sniff.image_pixel_width}, image_pixel_height=${sniff.image_pixel_height}, image_file_format_mime=${sniff.image_file_format_mime}, aspect_ratio=${sniff.aspect_ratio}` +
        (sniff.approx_file_type_note
          ? `, approx_file_type_note=${JSON.stringify(sniff.approx_file_type_note)}`
          : '')
      : '';
    const prompt = buildScreenshotIntelligencePrompt(serverHint);

    const vlDisabled = Deno.env.get('DEEPSEEK_VL_DISABLED') === 'true';
    const vlEndpoint = getDeepSeekVlVisionUrl();
    const vlToken = getDeepSeekVlToken();
    const remote = opts?.remoteHttpsImageUrl?.trim() || '';

    if (!vlDisabled && vlToken && remote && vlEndpoint) {
      const vl = await visionDeepSeekVlApi(vlEndpoint, vlToken, remote, prompt);
      if (vl.success) {
        finalizeVisionResultIntelligence(vl);
        return vl;
      }
      console.warn('DeepSeek VL failed, trying fallbacks:', vl.error);
    } else if (!remote && !vlDisabled) {
      console.warn('Vision: no HTTPS image URL for DeepSeek VL (need file_path or public image_url); using fallbacks');
    }

    const compatUrl = visionOpenAiCompatibleUrl();
    const compatTok = getOpenAiCompatibleVisionToken();
    const compatModel = getOpenAiCompatibleVisionModel();
    if (compatUrl && compatTok) {
      const r2 = await visionOpenAiMultimodal(compatUrl, compatTok, compatModel, imageUrl, prompt, {
        response_format: { type: 'json_object' },
      });
      if (r2.success) {
        const out = { ...r2, vision_route: 'openai-compatible' as const };
        finalizeVisionResultIntelligence(out);
        return out;
      }
      console.warn('VISION_API multimodal failed:', r2.error);
    }

    const dsToken = getDeepSeekToken();
    if (!dsToken || !visionModelId) {
      return { success: false, error: 'DeepSeek API key or vision model missing' };
    }

    const r = await visionOpenAiMultimodal(
      getDeepSeekChatUrl(),
      dsToken,
      visionModelId,
      imageUrl,
      prompt,
      { thinking: { type: 'disabled' }, response_format: { type: 'json_object' } },
    );
    if (r.success) {
      const out = { ...r, vision_route: 'deepseek-chat' as const };
      finalizeVisionResultIntelligence(out);
      return out;
    }
    return { success: false, error: r.error || 'DeepSeek vision request failed' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/** Text LLM classification from window title + app name (DeepSeek only). */
async function analyzeWithAI(
  windowTitle: string,
  appName: string,
  token: string,
  textModel: string,
): Promise<any> {
  const systemPrompt = `You are an AI analyzing employee computer activity for a time tracking system.
Analyze the screenshot metadata and respond with ONLY valid JSON:
{
  "category": "productive" | "social_media" | "entertainment" | "gaming" | "shopping" | "communication",
  "activity_type": "string describing the activity",
  "is_work_related": true | false,
  "distraction_score": 0-100,
  "productivity_score": 0-100,
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation"
}
productivity_score should reflect focused work (higher is better). It should align inversely with distraction_score.

Consider context: YouTube tutorials are work-related, development forums are productive, etc.`;

  const userMessage = `Window Title: ${windowTitle || 'Unknown'}
Application: ${appName || 'Unknown'}

Respond with ONLY valid JSON.`;

  for (const model of [textModel]) {
    try {
      const body: Record<string, unknown> = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 400,
        temperature: 0.3,
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' },
      };

      const response = await fetch(getDeepSeekChatUrl(), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`Model ${model} failed: ${response.status} - ${errorText}`);
        continue;
      }

      const result = await response.json();
      const usage = extractOpenAiUsage(result as Record<string, unknown>);
      let text = result.choices?.[0]?.message?.content || '';

      const jsonMatch = text?.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log(`AI analysis succeeded with model: ${model}`);
        return {
          success: true,
          ...parsed,
          ai_model: model,
          usage,
        };
      }

      console.warn(`Model ${model} returned unparseable response`);
      continue;
    } catch (error: any) {
      console.warn(`Model ${model} error: ${error.message}`);
      continue;
    }
  }

  return { success: false, error: 'DeepSeek text request failed or returned unparseable JSON' };
}

/**
 * Merge AI analysis with pattern analysis
 */
function mergeAnalysis(patternAnalysis: any, aiResult: any): any {
  if (!aiResult.success) return patternAnalysis;

  const distraction = aiResult.distraction_score ?? patternAnalysis.distraction_score;
  let productivity =
    typeof aiResult.productivity_score === 'number' ? clampScore(aiResult.productivity_score) : undefined;
  if (productivity === undefined) {
    productivity = clampScore(100 - distraction);
  }

  return {
    ...patternAnalysis,
    category: aiResult.category || patternAnalysis.category,
    activity_type: aiResult.activity_type || patternAnalysis.activity_type,
    distraction_score: distraction,
    productivity_score: productivity,
    confidence_score: Math.round((aiResult.confidence || 0.7) * 100),
    is_work_related: aiResult.is_work_related ?? patternAnalysis.is_work_related,
    reasoning: [...patternAnalysis.reasoning, `AI: ${aiResult.reasoning || 'LLM classification'}`],
    analysis_method: 'ai-enhanced',
    ai_model: aiResult.ai_model,
  };
}

/**
 * Merge vision analysis with existing analysis
 */
function mergeVisionAnalysis(analysis: any, visionResult: any): any {
  if (!visionResult.success) return analysis;

  const intel = visionResult.screenshot_intelligence as Record<string, unknown> | undefined;
  const cls0 = intel && Array.isArray(intel.classifications) && intel.classifications[0]
    ? (intel.classifications[0] as Record<string, unknown>)
    : null;
  const visionReasonLine = cls0?.label
    ? `Intelligence: ${cls0.label}`
    : `Vision: ${visionResult.detected_content?.substring(0, 100) || 'Image analyzed'}`;

  const textIntelOnly = visionResult.vision_route === 'deepseek-text-intelligence';
  const nextMethod = textIntelOnly
    ? (analysis.analysis_method === 'ai-enhanced' ? 'ai-text-intelligence-enhanced' : 'text-intelligence-enhanced')
    : (analysis.analysis_method === 'ai-enhanced' ? 'ai-vision-enhanced' : 'vision-enhanced');

  const merged = {
    ...analysis,
    vision_content: visionResult.detected_content,
    reasoning: [...analysis.reasoning, visionReasonLine],
    analysis_method: nextMethod,
  };

  if (typeof visionResult.distraction_score === 'number') {
    merged.distraction_score = visionResult.distraction_score;
  }
  if (typeof visionResult.productivity_score === 'number') {
    merged.productivity_score = visionResult.productivity_score;
  } else if (typeof visionResult.distraction_score === 'number') {
    merged.productivity_score = clampScore(100 - visionResult.distraction_score);
  }

  // If vision returned a structured category, prefer it over pattern matching
  if (visionResult.category) {
    merged.category = visionResult.category;
    merged.is_work_related = visionResult.is_work_related ?? (visionResult.category === 'productive' || visionResult.category === 'communication');
    merged.confidence_score = Math.round((visionResult.confidence || 0.85) * 100);
  }

  return merged;
}

/**
 * Create alerts if conditions are met
 */
async function createAlertsIfNeeded(
  supabase: any,
  userId: string,
  screenshotId: string,
  analysis: any,
  consecutiveDuplicates: number,
  visionResult: any,
  organizationId: string | null = null
): Promise<string | null> {
  try {
    // Check for non-work activity alert
    if (ALERT_CATEGORIES.includes(analysis.category)) {
      // Check cooldown - don't spam alerts
      const cooldownMinutes = 15;
      const cooldownTime = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();

      const { data: recentAlerts } = await supabase
        .from('admin_alerts')
        .select('id')
        .eq('user_id', userId)
        .eq('alert_type', 'non_work_activity')
        .gte('created_at', cooldownTime)
        .limit(1);

      if (!recentAlerts || recentAlerts.length === 0) {
        const severity = HIGH_ALERT_CATEGORIES.includes(analysis.category) ? 'high' : 'medium';
        const categoryLabels: Record<string, string> = {
          gaming: 'Gaming',
          social_media: 'Social Media',
          entertainment: 'Entertainment',
          shopping: 'Shopping',
        };

        const { data: alert, error } = await supabase
          .from('admin_alerts')
          .insert({
            user_id: userId,
            organization_id: organizationId,
            screenshot_id: screenshotId,
            alert_type: 'non_work_activity',
            severity,
            category: analysis.category,
            title: `${categoryLabels[analysis.category] || 'Non-Work'} Activity Detected`,
            message: `${analysis.activity_type}: ${analysis.reasoning.join('. ')}`,
            ai_confidence: analysis.confidence_score / 100,
            ai_reasoning: analysis.reasoning.join('. '),
            vision_analysis: visionResult?.success ? visionResult : null,
            metadata: {
              distraction_score: analysis.distraction_score,
              window_title: analysis.window_title_analyzed,
              app_name: analysis.app_name_analyzed,
            }
          })
          .select('id')
          .single();

        if (!error && alert) {
          console.log(`🚨 Alert created: [${severity.toUpperCase()}] ${analysis.category}`);
          return alert.id;
        }
      }
    }

    // Check for consecutive duplicate alert
    if (consecutiveDuplicates >= DUPLICATE_ALERT_THRESHOLDS.MEDIUM) {
      let severity: string = 'low';
      if (consecutiveDuplicates >= DUPLICATE_ALERT_THRESHOLDS.CRITICAL) {
        severity = 'critical';
      } else if (consecutiveDuplicates >= DUPLICATE_ALERT_THRESHOLDS.HIGH) {
        severity = 'high';
      } else if (consecutiveDuplicates >= DUPLICATE_ALERT_THRESHOLDS.MEDIUM) {
        severity = 'medium';
      }

      // Check cooldown for duplicate alerts
      const { data: recentDupAlerts } = await supabase
        .from('admin_alerts')
        .select('id')
        .eq('user_id', userId)
        .eq('alert_type', 'consecutive_duplicates')
        .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
        .limit(1);

      if (!recentDupAlerts || recentDupAlerts.length === 0) {
        const { data: alert, error } = await supabase
          .from('admin_alerts')
          .insert({
            user_id: userId,
            organization_id: organizationId,
            screenshot_id: screenshotId,
            alert_type: 'consecutive_duplicates',
            severity,
            title: consecutiveDuplicates >= 20 ? 'Extended Inactivity Detected' : 'Multiple Duplicate Screenshots',
            message: `${consecutiveDuplicates} consecutive identical screenshots detected. User may be idle or away.`,
            metadata: {
              consecutive_count: consecutiveDuplicates,
            }
          })
          .select('id')
          .single();

        if (!error && alert) {
          console.log(`🚨 Duplicate alert created: [${severity.toUpperCase()}] ${consecutiveDuplicates} duplicates`);
          return alert.id;
        }
      }
    }

    // Check for privacy concerns
    if (analysis.privacy_concerns && analysis.privacy_concerns.length > 0 && analysis.privacy_risk_score >= 60) {
      const { data: alert, error } = await supabase
        .from('admin_alerts')
        .insert({
          user_id: userId,
          organization_id: organizationId,
          screenshot_id: screenshotId,
          alert_type: 'privacy_concern',
          severity: analysis.privacy_risk_score >= 80 ? 'critical' : 'high',
          title: 'Privacy Sensitive Content Detected',
          message: `Screenshot may contain sensitive information: ${analysis.privacy_concerns.join(', ')}`,
          metadata: {
            privacy_concerns: analysis.privacy_concerns,
            privacy_risk_score: analysis.privacy_risk_score,
          }
        })
        .select('id')
        .single();

      if (!error && alert) {
        console.log(`🚨 Privacy alert created: ${analysis.privacy_concerns.join(', ')}`);
        return alert.id;
      }
    }

    return null;
  } catch (error) {
    console.error('Error creating alert:', error);
    return null;
  }
}

console.log('🤖 AI Screenshot Analyzer — DeepSeek-only (text + optional DEEPSEEK_VISION_MODEL)');
