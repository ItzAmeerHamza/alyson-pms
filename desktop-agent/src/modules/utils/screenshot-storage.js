const { createFeatureLogger } = require('./logger');
const { computeDHash } = require('./perceptual-hash');

const log = createFeatureLogger('SCREEN', { adapter: 'storage' });

let nativeImage = null;
try {
  nativeImage = require('electron').nativeImage;
  log.debug({ step: 'NATIVE_IMAGE_LOADED', ctx: { available: true } });
} catch (e) {
  log.warn({ step: 'NATIVE_IMAGE_UNAVAILABLE', message: 'Will skip perceptual hash computation' });
}

const UPLOAD_TIMEOUT_MS = 45000;

function resolveDesktopSyncConfig() {
  const cfg = global.config || {};
  const url =
    cfg.backend_api_url ||
    process.env.BACKEND_API_URL ||
    process.env.DESKTOP_SYNC_API_URL ||
    '';
  const apiKey = cfg.backend_api_key || process.env.INTERNAL_API_KEY || '';
  if (!url || !apiKey) {
    log.warn({
      step: 'S3_CONFIG_MISSING',
      message: 'Set BACKEND_API_URL and INTERNAL_API_KEY in desktop-agent/.env',
      ctx: { hasUrl: Boolean(url), hasKey: Boolean(apiKey) },
    });
    return null;
  }
  const syncUrl = url.includes('/sync/desktop-action')
    ? url
    : `${url.replace(/\/$/, '')}/sync/desktop-action`;
  return { syncUrl, apiKey };
}

async function fetchWithTimeout(url, options, timeoutMs = UPLOAD_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callDesktopSync(syncUrl, apiKey, action, data) {
  log.info({ step: 'S3_API_CALL', ctx: { action } });
  const response = await fetchWithTimeout(syncUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({ action, data }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = body?.message || body?.error || response.statusText || 'Sync API error';
    throw new Error(`${action} failed (${response.status}): ${msg}`);
  }
  return body;
}

async function uploadScreenshotViaS3Api({
  userId,
  uploadBuffer,
  contentType,
  ext,
  capturedAt,
  timeLogId,
  activityPercent,
  focusPercent,
  clicks,
  keys,
  moves,
  appName,
  windowTitle,
  agentVersion,
  perceptualHash,
}) {
  const sync = resolveDesktopSyncConfig();
  if (!sync) {
    return { error: 'Backend sync API not configured (BACKEND_API_URL + INTERNAL_API_KEY)' };
  }

  log.info({ step: 'S3_UPLOAD_START', ctx: { userId, bytes: uploadBuffer.length } });

  const init = await callDesktopSync(sync.syncUrl, sync.apiKey, 'screenshot_upload_init', {
    user_id: userId,
    captured_at: capturedAt || new Date().toISOString(),
    content_type: contentType,
    ext,
  });

  log.info({ step: 'S3_PUT_START', ctx: { s3_key: init.s3_key } });

  const putRes = await fetchWithTimeout(
    init.upload_url,
    {
      method: 'PUT',
      headers: { 'Content-Type': init.content_type || contentType },
      body: uploadBuffer,
    },
    UPLOAD_TIMEOUT_MS,
  );
  if (!putRes.ok) {
    const errText = await putRes.text().catch(() => '');
    return { error: `S3 PUT failed (${putRes.status}): ${errText.slice(0, 120)}` };
  }

  log.info({ step: 'S3_PUT_OK', ctx: { s3_key: init.s3_key } });

  const completePayload = {
    id: init.id,
    user_id: userId,
    s3_key: init.s3_key,
    time_log_id: timeLogId,
    file_path: init.s3_key,
    file_size: uploadBuffer.length,
    captured_at: capturedAt || new Date().toISOString(),
    activity_percent: Math.round(Number(activityPercent) || 0),
    focus_percent: Math.round(Number(focusPercent) || 0),
    mouse_clicks: Math.round(Number(clicks) || 0),
    keystrokes: Math.round(Number(keys) || 0),
    mouse_movements: Math.round(Number(moves) || 0),
    app_name: appName || null,
    window_title: windowTitle || null,
    agent_version: agentVersion || null,
    perceptual_hash: perceptualHash,
  };

  let lastCompleteError = 'screenshot_upload_complete failed';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const complete = await callDesktopSync(sync.syncUrl, sync.apiKey, 'screenshot_upload_complete', {
        metadata: completePayload,
      });
      log.info({ step: 'S3_COMPLETE_OK', ctx: { id: complete.id, attempt } });
      return { id: complete.id, url: null, s3_key: init.s3_key };
    } catch (err) {
      lastCompleteError = err?.message || String(err);
      log.warn({ step: 'S3_COMPLETE_RETRY', ctx: { attempt, message: lastCompleteError } });
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
  }

  return {
    error: `S3 file uploaded but database row missing: ${lastCompleteError}. Restart backend if you recently fixed screenshot_upload_complete.`,
  };
}

async function uploadScreenshotBuffer({
  buffer,
  userId,
  capturedAt,
  timeLogId = null,
  activityPercent = 0,
  focusPercent = 0,
  clicks = 0,
  keys = 0,
  moves = 0,
  activityLevel = null,
  appName = null,
  windowTitle = null,
  agentVersion = null,
}) {
  try {
    let uploadBuffer = buffer;
    let ext = 'png';
    let contentType = 'image/png';
    if (nativeImage) {
      try {
        const img = nativeImage.createFromBuffer(buffer);
        if (!img.isEmpty()) {
          uploadBuffer = img.toJPEG(80);
          ext = 'jpg';
          contentType = 'image/jpeg';
          log.debug({
            step: 'JPEG_CONVERT',
            ctx: {
              pngBytes: buffer.length,
              jpegBytes: uploadBuffer.length,
              ratio: `${((1 - uploadBuffer.length / buffer.length) * 100).toFixed(0)}%`,
            },
          });
        }
      } catch (convertErr) {
        log.warn({ step: 'JPEG_CONVERT_FAILED', message: convertErr.message });
      }
    }

    let perceptualHash = null;
    try {
      if (nativeImage) {
        perceptualHash = computeDHash(buffer, { nativeImage });
      }
    } catch (hashError) {
      log.warn({ step: 'PHASH_FAILED', message: hashError.message });
    }

    const capturedIso = capturedAt || new Date().toISOString();
    const s3Config = resolveDesktopSyncConfig();
    // S3 via the backend presigned URL is the only upload path — a missing config
    // must surface as an error so the caller retries instead of losing the capture.
    if (!s3Config) {
      const message = 'S3 not configured (BACKEND_API_URL + INTERNAL_API_KEY)';
      log.error({ step: 'S3_NOT_CONFIGURED', message });
      console.error(`❌ [SCREENSHOT-UPLOAD] ${message}`);
      return { error: message };
    }

    log.info({ step: 'S3_PATH', message: 'Uploading via backend presigned URL' });
    const s3Result = await uploadScreenshotViaS3Api({
      userId,
      uploadBuffer,
      contentType,
      ext,
      capturedAt: capturedIso,
      timeLogId,
      activityPercent,
      focusPercent,
      clicks,
      keys,
      moves,
      appName,
      windowTitle,
      agentVersion,
      perceptualHash,
    });
    if (s3Result.error) {
      log.error({ step: 'S3_UPLOAD_FAILED', message: s3Result.error });
      console.error(`❌ [SCREENSHOT-UPLOAD] S3 upload failed: ${s3Result.error}`);
      return s3Result;
    }

    log.info({ step: 'S3_UPLOAD_OK', ctx: { id: s3Result.id, s3_key: s3Result.s3_key } });
    return s3Result;
  } catch (error) {
    const msg =
      error?.name === 'AbortError'
        ? 'Upload timed out — is the backend running on localhost:3000?'
        : error.message;
    log.error({ step: 'EXCEPTION', message: msg });
    console.error(`❌ [SCREENSHOT-UPLOAD] Exception:`, msg);
    return { error: msg };
  }
}

module.exports = {
  uploadScreenshotBuffer,
  resolveDesktopSyncConfig,
};
