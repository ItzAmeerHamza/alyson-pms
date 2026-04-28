/**
 * Vision Validator Edge Function - Perceptual Hash Duplicate Detection
 * 
 * Analyzes screenshots using:
 * 1. Perceptual hash (dHash) for accurate visual duplicate detection
 * 2. AI vision model for content categorization
 * 
 * The perceptual hash is computed client-side and stored with the screenshot.
 * This function compares hashes using Hamming distance for similarity detection.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Gemini API (OpenAI-compatible endpoint) — falls back to HF if GEMINI_API_KEY not set
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const HF_ROUTER = 'https://router.huggingface.co/v1/chat/completions';
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const HF_VISION_MODEL = 'Qwen/Qwen2.5-VL-7B-Instruct';

let _cachedGeminiKey: string | null = null;

async function getGeminiKeyFromVault(supabase: any): Promise<string | null> {
  if (_cachedGeminiKey) return _cachedGeminiKey;
  try {
    const { data } = await supabase.rpc('get_secret', { secret_name: 'GEMINI_API_KEY' }).single();
    if (data?.decrypted_secret) {
      _cachedGeminiKey = data.decrypted_secret;
      return _cachedGeminiKey;
    }
  } catch (_e) { /* vault unavailable */ }
  return null;
}

function isUsingGemini(): boolean {
  return !!(_cachedGeminiKey || Deno.env.get('GEMINI_API_KEY'));
}
function getVisionApiUrl(): string {
  return isUsingGemini() ? GEMINI_API_URL : HF_ROUTER;
}
function getVisionModelName(): string {
  return isUsingGemini() ? GEMINI_MODEL : HF_VISION_MODEL;
}
function getVisionApiToken(): string {
  return _cachedGeminiKey || Deno.env.get('GEMINI_API_KEY') || Deno.env.get('HF_API_TOKEN') || '';
}

// Duplicate detection thresholds (Hamming distance on 64-bit dHash)
// Tightened to reduce false positives: browsing different pages of the same site
// was being flagged because layout similarity pushed distance ≤ 4.
const DUPLICATE_THRESHOLDS = {
  EXACT_DUPLICATE: 0,      // Identical images
  NEAR_DUPLICATE: 2,       // Same screen, only cursor/clock change (tightened from 4)
  SIMILAR_CONTENT: 4,      // Nearly identical, minor scroll (tightened from 6)
};

// Time window for duplicate comparison (in milliseconds)
// 10 minutes covers typical screenshot intervals (3-5 min) with room for gaps
const DUPLICATE_TIME_WINDOW_MS = 10 * 60 * 1000; // 10 minutes (was 5)
const DUPLICATE_MAX_COMPARE = 3; // Compare against 3 most recent (was 2)

interface VisionAnalysisResult {
  success: boolean;
  content?: string;
  category?: string;
  is_work_related?: boolean;
  confidence?: number;
  detected_content?: string;
  privacy_concerns?: string[];
  is_idle?: boolean;
  error?: string;
  model?: string;
}

/**
 * Compute Hamming distance between two perceptual hashes
 * @param hash1 - 16-character hex string (64-bit hash)
 * @param hash2 - 16-character hex string (64-bit hash)
 * @returns Number of differing bits (0-64)
 */
function hammingDistance(hash1: string, hash2: string): number {
  if (!hash1 || !hash2 || hash1.length !== 16 || hash2.length !== 16) {
    return 64; // Maximum distance if invalid
  }

  let distance = 0;
  for (let i = 0; i < 16; i += 2) {
    const byte1 = parseInt(hash1.substr(i, 2), 16);
    const byte2 = parseInt(hash2.substr(i, 2), 16);
    const xor = byte1 ^ byte2;
    // Count set bits (Brian Kernighan's algorithm)
    let bits = xor;
    while (bits) {
      distance++;
      bits &= bits - 1;
    }
  }

  return distance;
}

/**
 * Compare two screenshots using perceptual hash
 * @param hash1 - First perceptual hash
 * @param hash2 - Second perceptual hash
 * @param threshold - Maximum Hamming distance to consider similar (default: 10)
 */
function areHashesSimilar(hash1: string | null, hash2: string | null, threshold = DUPLICATE_THRESHOLDS.SIMILAR_CONTENT): { 
  isDuplicate: boolean; 
  confidence: number; 
  reason: string;
  distance: number;
} {
  if (!hash1 || !hash2) {
    return { isDuplicate: false, confidence: 0, reason: 'Missing perceptual hash', distance: 64 };
  }

  const distance = hammingDistance(hash1, hash2);
  const isDuplicate = distance <= threshold;
  
  // Confidence: 1.0 for exact match, decreasing with distance
  const confidence = Math.max(0, Math.round((1 - (distance / (threshold * 2))) * 100) / 100);

  let reason: string;
  if (distance === 0) {
    reason = 'Exact visual match (identical images)';
  } else if (distance <= DUPLICATE_THRESHOLDS.NEAR_DUPLICATE) {
    reason = `Near duplicate (distance: ${distance}) - same screen with minor changes like cursor`;
  } else if (distance <= DUPLICATE_THRESHOLDS.SIMILAR_CONTENT) {
    reason = `Similar content (distance: ${distance}) - same page with slight scroll or changes`;
  } else {
    reason = `Different content (distance: ${distance}) - visually distinct screenshots`;
  }

  return { isDuplicate, confidence, reason, distance };
}

// Legacy text comparison (kept as fallback when hash is not available)
function areScreenshotsSimilarByText(content1: string, content2: string): { isDuplicate: boolean; confidence: number; reason: string } {
  if (!content1 || !content2) {
    return { isDuplicate: false, confidence: 0, reason: 'Missing content for comparison' };
  }

  const words1 = content1.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const words2 = content2.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  
  if (words1.length === 0 || words2.length === 0) {
    return { isDuplicate: false, confidence: 0, reason: 'Insufficient content' };
  }

  // Calculate Jaccard similarity
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  const similarity = intersection.size / union.size;

  if (similarity > 0.7) {
    return { 
      isDuplicate: true, 
      confidence: similarity, 
      reason: `[FALLBACK TEXT] Similar content: ${Math.round(similarity * 100)}% word overlap` 
    };
  }

  return { 
    isDuplicate: false, 
    confidence: 1 - similarity, 
    reason: `[FALLBACK TEXT] Different content: only ${Math.round(similarity * 100)}% word overlap` 
  };
}

// ── Execution limits ──
// Supabase edge function timeout is ~150s; stay well under it
const EXECUTION_TIME_BUDGET_MS = 120_000; // 120 seconds hard ceiling
const VISION_API_TIMEOUT_MS = 12_000; // 12 seconds per Vision API call
const MAX_SCREENSHOTS_HARD_CAP = 50; // Process up to 50 per run (backlog drain mode)

/**
 * Fetch with a per-request timeout (AbortController)
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || 'https://timeflow.ebdaadt.com,http://localhost:8080,http://localhost:5173').split(',').map(o => o.trim());

// Main handler
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.some(o => origin === o) ? origin : '';
  const corsHeaders = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  const elapsed = () => Date.now() - startTime;
  const runId = `vision_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  try {
    console.log(`[${runId}] Starting vision validation (budget ${EXECUTION_TIME_BUDGET_MS / 1000}s, cap ${MAX_SCREENSHOTS_HARD_CAP})...`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing SUPABASE credentials');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Ensure Gemini key is loaded from vault if not in env
    if (!Deno.env.get('GEMINI_API_KEY') && !_cachedGeminiKey) {
      await getGeminiKeyFromVault(supabase);
    }

    const aiToken = getVisionApiToken();
    if (!aiToken) {
      console.warn(`[${runId}] Neither GEMINI_API_KEY nor HF_API_TOKEN set - vision analysis will be skipped, but duplicate detection will still run`);
    }

    // Get feature flags (default to enabled if no flags exist)
    const { data: flags } = await supabase
      .from('vision_feature_flags')
      .select('*')
      .limit(1)
      .single();

    const isEnabled = flags?.vision_validation_enabled ?? true;

    if (!isEnabled) {
      return new Response(JSON.stringify({ success: true, message: 'Vision validation disabled by config' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If no flags exist, create default flags
    if (!flags) {
      console.log(`[${runId}] No feature flags found, using defaults (vision enabled)`);
      await supabase.from('vision_feature_flags').insert({
        vision_validation_enabled: true,
        max_screenshots_per_run: MAX_SCREENSHOTS_HARD_CAP
      }).single();
    }

    // Hard cap overrides the DB value — this is the fix for the timeout problem
    const maxScreenshots = Math.min(
      flags?.max_screenshots_per_run || MAX_SCREENSHOTS_HARD_CAP,
      MAX_SCREENSHOTS_HARD_CAP
    );

    // Get screenshots to validate
    const { data: screenshots, error: fetchError } = await supabase
      .from('screenshots')
      .select('id, user_id, image_url, captured_at, app_name, window_title, activity_percent, duplicate_confidence, perceptual_hash, organization_id')
      .eq('needs_vision_validation', true)
      .is('vision_validated_at', null)
      .not('image_url', 'is', null)
      .order('captured_at', { ascending: true })
      .limit(maxScreenshots);

    if (fetchError) {
      throw new Error(`Failed to fetch screenshots: ${fetchError.message}`);
    }

    if (!screenshots || screenshots.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No screenshots pending', queue_empty: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[${runId}] Processing ${screenshots.length} screenshots (limit ${maxScreenshots})...`);

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 1 — FAST: Perceptual hash duplicate detection for ALL
    //           (~200ms per screenshot, no external API needed)
    // ═══════════════════════════════════════════════════════════════════

    interface HashResult {
      screenshot: typeof screenshots[0];
      isDuplicate: boolean;
      duplicateReason: string;
      matchedScreenshotId: string | null;
      duplicateGroupHash: string | null;
    }

    const hashResults: HashResult[] = [];
    let duplicatesConfirmed = 0;
    let duplicatesRejected = 0;

    for (const screenshot of screenshots) {
      let isDuplicate = false;
      let duplicateReason = '';
      let matchedScreenshotId: string | null = null;

      if (screenshot.perceptual_hash) {
        const screenshotTime = new Date(screenshot.captured_at).getTime();
        const windowStart = new Date(screenshotTime - DUPLICATE_TIME_WINDOW_MS).toISOString();

        const { data: recentScreenshots } = await supabase
          .from('screenshots')
          .select('id, perceptual_hash, captured_at, vision_detected_content, app_name, window_title')
          .eq('user_id', screenshot.user_id)
          .lt('captured_at', screenshot.captured_at)
          .not('perceptual_hash', 'is', null)
          .gte('captured_at', windowStart)
          .order('captured_at', { ascending: false })
          .limit(DUPLICATE_MAX_COMPARE);

        if (recentScreenshots && recentScreenshots.length > 0) {
          let bestMatch = { distance: 64, screenshot: null as any, contextMatch: false };

          for (const prevScreenshot of recentScreenshots) {
            const comparison = areHashesSimilar(screenshot.perceptual_hash, prevScreenshot.perceptual_hash);

            const sameApp = screenshot.app_name === prevScreenshot.app_name;
            const sameWindow = screenshot.window_title === prevScreenshot.window_title;
            const windowSimilar = !screenshot.window_title || !prevScreenshot.window_title ||
              (screenshot.window_title && prevScreenshot.window_title &&
                screenshot.window_title.substring(0, 30) === prevScreenshot.window_title.substring(0, 30));

            const contextMatch = sameApp && (sameWindow || windowSimilar);
            const activity = screenshot.activity_percent ?? 0;
            const allowSimilarThreshold = activity <= 50;

            const effectiveThreshold =
              contextMatch && allowSimilarThreshold
                ? DUPLICATE_THRESHOLDS.SIMILAR_CONTENT
                : DUPLICATE_THRESHOLDS.NEAR_DUPLICATE;

            if (comparison.distance <= effectiveThreshold && comparison.distance < bestMatch.distance) {
              bestMatch = { distance: comparison.distance, screenshot: prevScreenshot, contextMatch };
            }

            if (comparison.distance === 0) break;
          }

          const qualifiesAsDuplicate = bestMatch.screenshot && (
            bestMatch.distance <= DUPLICATE_THRESHOLDS.NEAR_DUPLICATE ||
            ((screenshot.activity_percent ?? 0) <= 50 && bestMatch.distance <= DUPLICATE_THRESHOLDS.SIMILAR_CONTENT && bestMatch.contextMatch)
          );

          if (qualifiesAsDuplicate) {
            isDuplicate = true;
            matchedScreenshotId = bestMatch.screenshot.id;
            if (bestMatch.distance === 0) {
              duplicateReason = 'Exact visual match (identical images, same window)';
            } else if (bestMatch.distance <= DUPLICATE_THRESHOLDS.NEAR_DUPLICATE) {
              duplicateReason = `Near duplicate (Hamming distance: ${bestMatch.distance}, same window)`;
            } else {
              duplicateReason = `Similar content with same context (Hamming distance: ${bestMatch.distance})`;
            }
            duplicatesConfirmed++;
            console.log(`[${runId}] PHASE1 ${screenshot.id}: DUPLICATE - ${duplicateReason}`);
          } else {
            const reason = bestMatch.screenshot
              ? `Visual distance ${bestMatch.distance}, context match: ${bestMatch.contextMatch}`
              : 'No close visual match';
            duplicateReason = `Unique content (${reason})`;
            if (screenshot.duplicate_confidence) duplicatesRejected++;
            console.log(`[${runId}] PHASE1 ${screenshot.id}: UNIQUE - ${duplicateReason}`);
          }
        } else {
          duplicateReason = 'No recent screenshots to compare (first in window)';
          console.log(`[${runId}] PHASE1 ${screenshot.id}: UNIQUE - first in window`);
        }
      } else {
        duplicateReason = 'No perceptual hash available for comparison';
        console.log(`[${runId}] PHASE1 ${screenshot.id}: No hash available`);
      }

      // Compute duplicate_group_hash
      let duplicateGroupHash: string | null = null;
      if (isDuplicate && matchedScreenshotId) {
        const dateStr = new Date(screenshot.captured_at).toISOString().split('T')[0];
        const hashInput = `${screenshot.user_id}${matchedScreenshotId}${dateStr}`;
        let hash = 0;
        for (let i = 0; i < hashInput.length; i++) {
          const char = hashInput.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        duplicateGroupHash = Math.abs(hash).toString(16).padStart(8, '0');
      }

      hashResults.push({ screenshot, isDuplicate, duplicateReason, matchedScreenshotId, duplicateGroupHash });
    }

    // Split results into duplicates vs unique for priority processing
    const duplicateResults = hashResults.filter(hr => hr.isDuplicate);
    const uniqueResults = hashResults.filter(hr => !hr.isDuplicate);
    console.log(`[${runId}] PHASE1 done in ${elapsed()}ms — ${duplicateResults.length} duplicates, ${uniqueResults.length} unique`);

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 2A — INSTANT: Save ALL duplicate results (no API needed)
    //            (~50ms per screenshot, just DB update)
    // ═══════════════════════════════════════════════════════════════════

    const results = [];
    let visionApiCalls = 0;
    let visionSkippedTimeout = 0;

    for (const hr of duplicateResults) {
      const analyzeStart = Date.now();
      await supabase
        .from('screenshots')
        .update({
          vision_validated_at: new Date().toISOString(),
          needs_vision_validation: false,
          is_duplicate: true,
          duplicate_reason: hr.duplicateReason,
          duplicate_group_hash: hr.duplicateGroupHash,
          duplicate_matched_id: hr.matchedScreenshotId,
        })
        .eq('id', hr.screenshot.id);

      await supabase.from('vision_api_calls_log').insert({
        validator_run_id: runId,
        screenshot_id: hr.screenshot.id,
        request_duration_ms: Date.now() - analyzeStart,
        response_status: 0,
        success: true,
        duplicate_confirmed: true,
        privacy_concern_detected: false,
      });

      results.push({
        success: true,
        screenshot_id: hr.screenshot.id,
        is_duplicate: true,
        category: 'unknown',
        vision_available: false,
      });
    }

    console.log(`[${runId}] PHASE2A: ${duplicateResults.length} duplicates saved in ${elapsed()}ms`);

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 2B — Save ALL unique results immediately (hash result only)
    //            then enrich with Vision API if time permits
    // ═══════════════════════════════════════════════════════════════════

    for (const hr of uniqueResults) {
      const analyzeStart = Date.now();

      // Try Vision API if we have time budget remaining
      let visionResult: VisionAnalysisResult = { success: false, error: 'skipped' };
      if (aiToken && hr.screenshot.image_url && elapsed() + VISION_API_TIMEOUT_MS + 2000 < EXECUTION_TIME_BUDGET_MS) {
        try {
          visionApiCalls++;
          visionResult = await analyzeScreenshotWithTimeout(hr.screenshot.image_url, aiToken, VISION_API_TIMEOUT_MS);
        } catch (visionErr: any) {
          console.warn(`[${runId}] Vision API failed for ${hr.screenshot.id}: ${visionErr.message}`);
          visionResult = { success: false, error: visionErr.message };
        }
      } else if (aiToken && hr.screenshot.image_url) {
        visionSkippedTimeout++;
      }

      // Always save — duplicate detection result is the priority
      const updateData: any = {
        vision_validated_at: new Date().toISOString(),
        needs_vision_validation: false,
        is_duplicate: false,
        duplicate_reason: hr.screenshot.duplicate_confidence ? `Cleared: ${hr.duplicateReason}` : null,
        duplicate_group_hash: null,
        duplicate_matched_id: null,
      };

      if (visionResult.success) {
        updateData.vision_category = visionResult.category;
        updateData.vision_confidence = visionResult.confidence;
        updateData.vision_detected_content = visionResult.detected_content;
        updateData.vision_privacy_concerns = visionResult.privacy_concerns || [];
        updateData.idle_inferred = visionResult.is_idle;
      }

      await supabase
        .from('screenshots')
        .update(updateData)
        .eq('id', hr.screenshot.id);

      await supabase.from('vision_api_calls_log').insert({
        validator_run_id: runId,
        screenshot_id: hr.screenshot.id,
        request_duration_ms: Date.now() - analyzeStart,
        response_status: visionResult.success ? 200 : 500,
        success: true,
        vision_category: visionResult.category || null,
        vision_confidence: visionResult.confidence || null,
        duplicate_confirmed: false,
        privacy_concern_detected: (visionResult.privacy_concerns?.length || 0) > 0,
      });

      results.push({
        success: true,
        screenshot_id: hr.screenshot.id,
        is_duplicate: false,
        category: visionResult.category || 'unknown',
        vision_available: visionResult.success,
      });

      // Time budget hard stop — remaining are already saved, just skip Vision
      if (elapsed() > EXECUTION_TIME_BUDGET_MS) {
        console.warn(`[${runId}] Time budget hit at ${elapsed()}ms — remaining unique screenshots saved without Vision`);
      }
    }

    // Log metrics
    const successCount = results.length;
    await supabase.from('vision_analysis_metrics').insert({
      validator_run_id: runId,
      execution_duration_ms: elapsed(),
      screenshots_processed: successCount,
      screenshots_failed: 0,
      api_calls_made: visionApiCalls,
      duplicates_confirmed: duplicatesConfirmed,
      duplicates_rejected: duplicatesRejected,
      status: 'completed',
    });

    console.log(`[${runId}] Done in ${elapsed()}ms — ${successCount} processed (${duplicatesConfirmed} dup, ${uniqueResults.length} unique), ${visionApiCalls} Vision API calls, ${visionSkippedTimeout} Vision skipped (time)`);

    return new Response(JSON.stringify({
      success: true,
      run_id: runId,
      screenshots_processed: successCount,
      duplicates_confirmed: duplicatesConfirmed,
      false_positives_caught: duplicatesRejected,
      vision_api_calls: visionApiCalls,
      vision_skipped_timeout: visionSkippedTimeout,
      deferred_to_next_run: 0,
      execution_time_ms: elapsed(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error(`[${runId}] Error:`, error);
    return new Response(JSON.stringify({ success: false, error: 'Validation failed', run_id: runId }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/**
 * Wrapper that enforces a per-call timeout on the Vision API
 */
async function analyzeScreenshotWithTimeout(imageUrl: string, token: string, timeoutMs: number): Promise<VisionAnalysisResult> {
  const question = `Analyze this screenshot and respond with ONLY valid JSON (no other text):
{
  "description": "Detailed description of what is visible — application name, content, file names, page titles",
  "category": "productive | social_media | entertainment | gaming | shopping | communication | other",
  "is_work_related": true or false,
  "confidence": 0.0 to 1.0
}

Classification rules:
- productive: IDEs, code editors, terminals, office apps, project management, design tools, documentation, file managers, business tools, spreadsheets, databases, cloud storage, browsers showing work content
- social_media: Facebook, Instagram, Twitter/X, TikTok, Snapchat, Reddit, Pinterest — personal social feeds
- entertainment: Netflix, YouTube (non-tutorial), Hulu, Disney+, HBO, Twitch streams, Spotify, movies, TV shows
- gaming: Steam, Epic Games, actual video games, game interfaces
- shopping: Amazon, eBay, personal online shopping on e-commerce sites
- communication: Slack, Teams, Zoom, email clients, work chat
- other: anything that doesn't clearly fit above

Important: File Explorer, Windows Explorer, Finder, and system utilities are ALWAYS productive. Browsers showing work-related content (documentation, admin panels, dashboards) are productive. Only classify as non-productive if the content is clearly personal/leisure activity.`;

  const response = await fetchWithTimeout(getVisionApiUrl(), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: getVisionModelName(),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageUrl } },
            { type: 'text', text: question }
          ]
        }
      ],
      max_tokens: 400,
    }),
  }, timeoutMs);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vision API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  let generatedText = data.choices?.[0]?.message?.content || '';

  // Parse structured JSON response
  let category = 'other';
  let is_work_related = true;
  let confidence = 0.85;
  let descriptionText = generatedText;

  try {
    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validCategories = ['productive', 'social_media', 'entertainment', 'gaming', 'shopping', 'communication', 'other'];
      if (parsed.category && validCategories.includes(parsed.category)) {
        category = parsed.category;
        is_work_related = parsed.is_work_related ?? (category === 'productive' || category === 'communication');
        confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.85;
        descriptionText = parsed.description || generatedText;
      }
    }
  } catch { /* JSON parse failed — use defaults */ }

  // Fallback pattern matching (same as original)
  if (category === 'other') {
    const lowerContent = (descriptionText + ' ' + generatedText).toLowerCase();
    const productivePatterns = ['code','coding','editor','ide','terminal','programming','developer','github','gitlab','jira','confluence','notion','figma','spreadsheet','excel','google sheets','document','word','postman','calendar','outlook','slack','dashboard','devtools','vscode','visual studio','xcode','android studio','intellij','pycharm','webstorm','cursor','file explorer','windows explorer','finder','task manager','command prompt','powershell'];
    const socialMediaPatterns = ['facebook','instagram','twitter','tiktok','snapchat','reddit','pinterest','tumblr','threads','social media','news feed','reels'];
    const entertainmentPatterns = ['youtube','netflix','hulu','disney+','amazon prime video','hbo','twitch stream','spotify','music streaming','video player'];
    const gamingPatterns = ['video game','gaming','steam store','epic games store','fortnite','minecraft','league of legends','valorant','game menu','game interface'];
    const shoppingPatterns = ['online shopping','amazon.com','ebay.com','shopping cart','checkout page','add to cart','e-commerce'];

    if (productivePatterns.some(p => lowerContent.includes(p))) { category = 'productive'; is_work_related = true; }
    else if (socialMediaPatterns.some(p => lowerContent.includes(p))) { category = 'social_media'; is_work_related = false; }
    else if (entertainmentPatterns.some(p => lowerContent.includes(p))) { category = 'entertainment'; is_work_related = false; }
    else if (gamingPatterns.some(p => lowerContent.includes(p))) { category = 'gaming'; is_work_related = false; }
    else if (shoppingPatterns.some(p => lowerContent.includes(p))) { category = 'shopping'; is_work_related = false; }
    else if (['chat','message','email','teams','zoom'].some(p => lowerContent.includes(p))) { category = 'communication'; is_work_related = true; }
  }

  const lowerForIdle = generatedText.toLowerCase();
  const is_idle = lowerForIdle.includes('lock screen') || lowerForIdle.includes('login screen') ||
                  lowerForIdle.includes('screensaver') || lowerForIdle.includes('desktop wallpaper only');
  const privacy_concerns: string[] = [];
  if (lowerForIdle.includes('password')) privacy_concerns.push('password_visible');
  if (lowerForIdle.includes('bank') || lowerForIdle.includes('credit card')) privacy_concerns.push('financial_info');
  if (lowerForIdle.includes('personal') || lowerForIdle.includes('private')) privacy_concerns.push('personal_info');

  return {
    success: true,
    content: generatedText,
    category,
    is_work_related,
    confidence,
    detected_content: descriptionText.substring(0, 500),
    privacy_concerns,
    is_idle,
    model: getVisionModelName(),
  };
}
