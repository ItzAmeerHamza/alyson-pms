/**
 * DeepSeek chat/completions — text-only employee screenshot_intelligence JSON.
 * No image bytes are sent (DeepSeek chat is text-only). Optionally merge local image meta from file sniff.
 *
 * Usage:
 *   node --env-file=.env scripts/deepseek-screenshot-intelligence-text.mjs \
 *     --transcript transcript.txt \
 *     --image ./shot.png \
 *     --title "CrazyGames - Mahjong" \
 *     --app "Google Chrome" \
 *     --url "https://www.crazygames.com/"
 *
 * Env: DEEPSEEK_API_KEY (required), DEEPSEEK_MODEL (optional, default deepseek-v4-flash)
 *
 * For macOS pixel dimensions via sips instead of sniff, run:
 *   sips -g pixelWidth -g pixelHeight file.png
 */

import fs from 'fs';

const API = (process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com').replace(/\/$/, '') + '/chat/completions';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
const key = process.env.DEEPSEEK_API_KEY;
if (!key) {
  console.error('Set DEEPSEEK_API_KEY (e.g. node --env-file=.env ...)');
  process.exit(1);
}

function readU32BE(bytes, offset) {
  return (
    ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
  );
}

function sniffImageMeta(bytes, filePath) {
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
  } else return null;
  if (!w || !h) return null;
  const ext = filePath?.split('.').pop()?.toLowerCase() || '';
  let approx_file_type_note = null;
  if (ext === 'png' && mime === 'image/jpeg') approx_file_type_note = 'extension_says_png_but_content_is_jpeg';
  else if ((ext === 'jpg' || ext === 'jpeg') && mime === 'image/png') {
    approx_file_type_note = 'extension_says_jpg_but_content_is_png';
  }
  const aspect_ratio = Math.round((w / h) * 10000) / 10000;
  return { image_file_format_mime: mime, image_pixel_width: w, image_pixel_height: h, aspect_ratio, approx_file_type_note };
}

function extractFirstJsonObject(s) {
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

function toStrArray(v) {
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

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  if (x > 1 && x <= 100) return Math.max(0, Math.min(1, x / 100));
  return Math.max(0, Math.min(1, x));
}

function coerceIntelligence(intel) {
  const out = { ...intel };
  if (out.meta && typeof out.meta === 'object') {
    const m = { ...out.meta };
    for (const k of ['image_pixel_width', 'image_pixel_height']) {
      const n = Number(m[k]);
      if (Number.isFinite(n)) m[k] = Math.round(n);
    }
    const ar = Number(m.aspect_ratio);
    if (Number.isFinite(ar)) m.aspect_ratio = Math.round(ar * 10000) / 10000;
    out.meta = m;
  }
  if (out.host_os_ui && typeof out.host_os_ui === 'object') {
    const h = out.host_os_ui;
    out.host_os_ui = { ...h, evidence: toStrArray(h.evidence) };
  }
  if (out.active_surface && typeof out.active_surface === 'object') {
    const s = out.active_surface;
    out.active_surface = {
      ...s,
      chrome_category_rows_visible: toStrArray(s.chrome_category_rows_visible),
      example_visible_game_titles: toStrArray(s.example_visible_game_titles),
      ui_badges_observed: toStrArray(s.ui_badges_observed),
    };
  }
  if (out.open_tabs_signals && typeof out.open_tabs_signals === 'object') {
    const t = out.open_tabs_signals;
    out.open_tabs_signals = { ...t, work_adjacent_favicons_inferred: toStrArray(t.work_adjacent_favicons_inferred) };
  }
  for (const key of ['primary_activity_hypothesis', 'secondary_context']) {
    const o = out[key];
    if (o && typeof o === 'object') {
      const r = { ...o };
      const c = clamp01(r.confidence_0_1);
      if (c != null) r.confidence_0_1 = c;
      out[key] = r;
    }
  }
  if (out.sprint_matching_hints && typeof out.sprint_matching_hints === 'object') {
    const sp = out.sprint_matching_hints;
    out.sprint_matching_hints = {
      ...sp,
      suggested_feature_fields_for_ticket_matching: toStrArray(sp.suggested_feature_fields_for_ticket_matching),
    };
  }
  if (out.attributes_flat && typeof out.attributes_flat === 'object') {
    const f = out.attributes_flat;
    const d = clamp01(f.distraction_risk_score_suggested_0_1);
    out.attributes_flat = { ...f, ...(d != null ? { distraction_risk_score_suggested_0_1: d } : {}) };
  }
  const clsArr = Array.isArray(out.classifications) ? out.classifications : [];
  out.classifications = clsArr.map((item) => {
    if (item && typeof item === 'object') {
      const it = item;
      const c = clamp01(it.confidence_0_1) ?? 0.5;
      return {
        label: String(it.label ?? 'unknown'),
        confidence_0_1: c,
        rationale: String(it.rationale ?? ''),
      };
    }
    return { label: String(item), confidence_0_1: 0.5, rationale: '' };
  });
  out.feature_vector_suggestions = toStrArray(out.feature_vector_suggestions);
  return out;
}

function mergeFileMeta(intel, serverMeta) {
  const prev = intel.meta && typeof intel.meta === 'object' ? intel.meta : {};
  intel.meta = {
    ...prev,
    source: 'employee_screenshot',
    image_file_format_mime: serverMeta.image_file_format_mime,
    image_pixel_width: serverMeta.image_pixel_width,
    image_pixel_height: serverMeta.image_pixel_height,
    aspect_ratio: serverMeta.aspect_ratio,
    approx_file_type_note: serverMeta.approx_file_type_note ?? prev.approx_file_type_note ?? null,
  };
  return intel;
}

function parseArgs() {
  const o = { transcript: '', image: '', title: '', app: '', url: '' };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--transcript' && argv[i + 1]) o.transcript = argv[++i];
    else if (a === '--image' && argv[i + 1]) o.image = argv[++i];
    else if (a === '--title' && argv[i + 1]) o.title = argv[++i];
    else if (a === '--app' && argv[i + 1]) o.app = argv[++i];
    else if (a === '--url' && argv[i + 1]) o.url = argv[++i];
  }
  return o;
}

const args = parseArgs();
let transcript = args.transcript ? fs.readFileSync(args.transcript, 'utf8') : '';
if (!transcript && process.stdin.isTTY) {
  /* allow empty transcript — metadata-only run */
}

const schemaHint = `Schema: single JSON with keys analysis_method_note, meta, host_os_ui, browser_context, active_surface, open_tabs_signals, primary_activity_hypothesis, secondary_context, privacy_and_policy_signals, sprint_matching_hints, attributes_flat, classifications, feature_vector_suggestions. Confidences 0-1. Arrays must be JSON arrays.`;

let serverMeta = null;
if (args.image && fs.existsSync(args.image)) {
  const buf = fs.readFileSync(args.image);
  serverMeta = sniffImageMeta(buf, args.image);
}

const metaHint = serverMeta
  ? `\nKnown from file bytes (use for meta.*): image_pixel_width=${serverMeta.image_pixel_width}, image_pixel_height=${serverMeta.image_pixel_height}, image_file_format_mime=${serverMeta.image_file_format_mime}, aspect_ratio=${serverMeta.aspect_ratio}` +
    (serverMeta.approx_file_type_note ? `, approx_file_type_note=${JSON.stringify(serverMeta.approx_file_type_note)}` : '')
  : '\nNo --image provided; estimate meta cautiously or null.';

const userPrompt = `You do NOT have the image. Produce workforce screenshot analytics JSON only.

${schemaHint}

Set analysis_method_note: DeepSeek chat text-only; no pixels; inputs were transcript and/or window metadata.

Inputs:
${transcript.trim() ? `Transcript:\n${transcript.trim()}` : 'Transcript: (none)'}
Window title: ${args.title || '(unknown)'}
App: ${args.app || '(unknown)'}
URL: ${args.url || '(unknown)'}
${metaHint}`;

const res = await fetch(API, {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: 'Output only valid JSON. No markdown fences.',
      },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: Number(process.env.INTELLIGENCE_TEXT_MAX_TOKENS || '8192'),
    temperature: 0.2,
    response_format: { type: 'json_object' },
  }),
});

if (!res.ok) {
  console.error(await res.text());
  process.exit(1);
}

const data = await res.json();
const content = String(data.choices?.[0]?.message?.content || '');
const slice = extractFirstJsonObject(content);
if (!slice) {
  console.error('No JSON object in response:', content.slice(0, 500));
  process.exit(1);
}
let parsed;
try {
  parsed = JSON.parse(slice);
} catch (e) {
  console.error(e);
  process.exit(1);
}
parsed = coerceIntelligence(parsed);
if (serverMeta) mergeFileMeta(parsed, serverMeta);
if (!parsed.analysis_method_note) {
  parsed.analysis_method_note =
    'Text-only: api.deepseek.com chat/completions; confidences are not pixel-grounded.';
}
console.log(JSON.stringify(parsed, null, 2));
