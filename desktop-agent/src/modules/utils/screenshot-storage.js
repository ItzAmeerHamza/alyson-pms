const { resolveSupabaseClient } = require('./session-recovery');
const { createFeatureLogger } = require('./logger');
const { computeDHash } = require('./perceptual-hash');

const log = createFeatureLogger('SCREEN', { adapter: 'storage' });

// Get nativeImage at module load time (when Electron context is available)
let nativeImage = null;
try {
  nativeImage = require('electron').nativeImage;
  log.debug({ step: 'NATIVE_IMAGE_LOADED', ctx: { available: true } });
} catch (e) {
  log.warn({ step: 'NATIVE_IMAGE_UNAVAILABLE', message: 'Will skip perceptual hash computation' });
}

async function uploadScreenshotBuffer({
  supabase,
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
  agentVersion = null // Add agent version tracking (v1.0.124+)
}) {
  try {
    const client = supabase || resolveSupabaseClient();
    if (!client) {
      return { error: 'Supabase client not available' };
    }

    // Convert PNG to JPEG for ~70% smaller file size (705 KB avg → ~150 KB)
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
          log.debug({ step: 'JPEG_CONVERT', ctx: { pngBytes: buffer.length, jpegBytes: uploadBuffer.length, ratio: ((1 - uploadBuffer.length / buffer.length) * 100).toFixed(0) + '%' } });
        }
      } catch (convertErr) {
        log.warn({ step: 'JPEG_CONVERT_FAILED', message: convertErr.message });
      }
    }

    const timestamp = new Date(capturedAt || Date.now()).toISOString().replace(/[:.]/g, '-');
    const fileName = `${userId}/${timestamp}.${ext}`;

    const uploadResponse = await client.storage
      .from('screenshots')
      .upload(fileName, uploadBuffer, {
        contentType,
        upsert: true
      });

    if (uploadResponse.error) {
      log.error({ step: 'UPLOAD_FAILED', message: uploadResponse.error.message });
      return { error: uploadResponse.error.message };
    }

    const publicUrl = client.storage.from('screenshots').getPublicUrl(fileName).data?.publicUrl || null;

    // Calculate activity_level if not provided
    const totalActivity = (clicks || 0) + (keys || 0) + (moves || 0);
    let calculatedActivityLevel = activityLevel;
    if (!calculatedActivityLevel) {
      if (totalActivity === 0) calculatedActivityLevel = 'idle';
      else if (totalActivity < 10) calculatedActivityLevel = 'low';
      else if (totalActivity < 50) calculatedActivityLevel = 'medium';
      else calculatedActivityLevel = 'high';
    }

    // Compute perceptual hash for duplicate detection
    let perceptualHash = null;
    try {
      if (nativeImage) {
        perceptualHash = computeDHash(buffer, { nativeImage });
        if (perceptualHash) {
          log.debug({ step: 'PHASH_COMPUTED', ctx: { hash: perceptualHash } });
        }
      } else {
        log.debug({ step: 'PHASH_SKIP', message: 'nativeImage not available' });
      }
    } catch (hashError) {
      log.warn({ step: 'PHASH_FAILED', message: hashError.message });
    }

    const insertPayload = {
      user_id: userId,
      time_log_id: timeLogId,
      image_url: publicUrl,
      file_path: fileName,
      captured_at: capturedAt || new Date().toISOString(),
      activity_percent: activityPercent || 0,
      focus_percent: focusPercent || 0,
      mouse_clicks: clicks || 0,        // Fixed: was 'clicks'
      keystrokes: keys || 0,            // Fixed: was 'keys'
      mouse_movements: moves || 0,      // Fixed: was 'moves'
      app_name: appName || null,        // Added: app name
      window_title: windowTitle || null, // Added: window title
      agent_version: agentVersion || null, // Added: agent version (v1.0.124+)
      perceptual_hash: perceptualHash,  // Added: perceptual hash for duplicate detection
      needs_vision_validation: true     // Flag for Vision Validator to process duplicate detection
      // Removed activity_level - column doesn't exist in database
    };

    const { data, error } = await client.from('screenshots').insert(insertPayload).select('id').single();
    if (error) {
      log.error({ step: 'INSERT_FAILED', message: error.message });
      return { error: error.message };
    }

    return { id: data.id, url: publicUrl };
  } catch (error) {
    log.error({ step: 'EXCEPTION', message: error.message });
    return { error: error.message };
  }
}

module.exports = {
  uploadScreenshotBuffer
};

