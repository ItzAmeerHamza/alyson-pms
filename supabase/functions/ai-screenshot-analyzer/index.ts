/**
 * AI Screenshot Analyzer — pattern + DeepSeek (text + optional vision only)
 *
 * Runs on Supabase Edge (Deno). Configure via Edge Function secrets, e.g.:
 *   supabase secrets set DEEPSEEK_API_KEY=sk-...
 *
 * Secrets:
 * - DEEPSEEK_API_KEY — required for LLM text (window title / app). Optional vault: get_secret('DEEPSEEK_API_KEY')
 * - DEEPSEEK_MODEL — optional; default deepseek-v4-flash
 * - DEEPSEEK_API_BASE — optional; default https://api.deepseek.com
 * - Request body (optional): deepseek_model, deepseek_vision_model — must be deepseek-v4-flash or deepseek-v4-pro
 * - DEEPSEEK_VISION_MODEL — fallback vision model id when body omits deepseek_vision_model
 * - SCREENSHOTS_STORAGE_BUCKET — optional; default screenshots (loads image bytes via service role + file_path)
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
): Promise<{ imageUrl: string; source: 'storage' | 'public_url' } | { error: string }> {
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
        return { imageUrl: dataUrl, source: 'storage' };
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
      use_ai = true,        // Enable DeepSeek text analysis
      use_vision,           // Enable vision analysis (auto-detected if not specified)
      create_alerts = true, // Enable alert creation
      force_vision = false, // Force vision analysis regardless of conditions
      force_ai = false,     // Force AI text classification even if patterns are confident
      generate_description  // If true, run vision to generate a human-readable description
    } = requestBody;

    if (!screenshot_id) {
      return new Response(
        JSON.stringify({ error: 'screenshot_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🤖 Starting AI screenshot analysis for:', screenshot_id);

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

    const titleToAnalyze = window_title || screenshot.window_title || '';
    const appToAnalyze = app_name || screenshot.app_name || '';
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
            visionResult = await analyzeWithVision(resolvedVision.imageUrl, visionModelForRequest);
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
    const imageDescription =
      (visionResult?.success && typeof visionResult.detected_content === 'string' && visionResult.detected_content.trim().length > 0)
        ? visionResult.detected_content.trim()
        : null;

    const deepseek_usage = buildDeepseekUsagePayload(
      textUsage,
      visionUsage,
      textModelForRequest,
      visionModelForRequest,
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
        ...analysis,
        image_description: imageDescription,
        analyzed_at: new Date().toISOString(),
        analysis_version: '5.0.0-deepseek-only',
        source: 'ai-screenshot-analyzer',
        ai_enhanced: aiEnhanced,
        vision_used: !!visionResult?.success,
        vision_reason: visionReason,
        ...(deepseek_usage ? { deepseek_usage } : {}),
      }
    };

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
      visionUsed: !!visionResult?.success,
      visionReason: visionReason,
      alertCreated: !!alertId,
      consecutiveDuplicates: consecutiveDuplicateCount,
      duplicateOverride: analysis.duplicate_override || false
    });

    return new Response(
      JSON.stringify({
        success: true,
        analysis,
        ai_enhanced: aiEnhanced,
        vision_result: visionResult,
        vision_reason: visionReason,
        vision_used: !!visionResult?.success,
        alert_id: alertId,
        consecutive_duplicate_count: consecutiveDuplicateCount,
        duplicate_override: analysis.duplicate_override || false,
        deepseek_usage,
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
): Record<string, unknown> | undefined {
  const textPart = text ? { ...text, model: textModel } : undefined;
  const visionPart = vision ? { ...vision, model: visionModel } : undefined;
  const total_tokens = (text?.total_tokens ?? 0) + (vision?.total_tokens ?? 0);
  if (!textPart && !visionPart) return undefined;
  return {
    text: textPart,
    vision: visionPart,
    total_tokens,
  };
}

function parseVisionJsonPayload(text: string, model: string): any {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { success: false as const, error: 'unparseable' };
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const validCategories = ['productive', 'social_media', 'entertainment', 'gaming', 'shopping', 'communication', 'other'];
    const prod =
      typeof parsed.productivity_score === 'number' ? clampScore(parsed.productivity_score) : undefined;
    return {
      success: true as const,
      detected_content: parsed.detected_content || text.substring(0, 500),
      category: validCategories.includes(parsed.category) ? parsed.category : undefined,
      is_work_related: parsed.is_work_related,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
      privacy_concerns: parsed.privacy_concerns || [],
      is_idle: parsed.is_idle || false,
      productivity_score: prod,
      distraction_score: typeof parsed.distraction_score === 'number' ? clampScore(parsed.distraction_score) : undefined,
      model,
    };
  } catch {
    return { success: false as const, error: 'json_parse' };
  }
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
            { type: 'image_url', image_url: { url: imageUrl } },
            { type: 'text', text: prompt },
          ],
        },
      ],
      max_tokens: 400,
      temperature: 0.2,
      ...extra,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
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

/**
 * Vision: DeepSeek multimodal (same API key; model id from request or env).
 */
async function analyzeWithVision(imageUrl: string, visionModelId: string): Promise<any> {
  try {
    const prompt = `Analyze this screenshot and respond with ONLY valid JSON (no other text):
{
  "detected_content": "Brief description of what is visible (max 50 words)",
  "category": "productive | social_media | entertainment | gaming | shopping | communication | other",
  "is_work_related": true or false,
  "distraction_score": 0-100,
  "productivity_score": 0-100,
  "confidence": 0.0 to 1.0,
  "privacy_concerns": [],
  "is_idle": false
}

Use distraction_score for how distracting/non-work the screen is (higher = worse). productivity_score is the inverse notion on a 0-100 scale (higher = more focused/work-aligned).

Classification rules:
- productive: IDEs, code editors, terminals, office apps, project management, design tools, file managers (File Explorer, Finder), system utilities, browsers showing work content, admin panels, dashboards
- social_media: Facebook, Instagram, Twitter/X, TikTok, Snapchat, Reddit — personal social feeds
- entertainment: Netflix, YouTube (non-tutorial), Hulu, Disney+, HBO, Twitch streams, Spotify, movies
- gaming: Steam, Epic Games, actual video games, game interfaces
- shopping: Amazon, eBay, personal online shopping on e-commerce sites
- communication: Slack, Teams, Zoom, email clients
- other: anything that doesn't clearly fit

Important: File Explorer, Windows Explorer, Finder, and system utilities are ALWAYS productive. Only classify as non-productive if the content is clearly personal/leisure activity.`;

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
    if (r.success) return r;
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

  const merged = {
    ...analysis,
    vision_content: visionResult.detected_content,
    reasoning: [...analysis.reasoning, `Vision: ${visionResult.detected_content?.substring(0, 100) || 'Image analyzed'}`],
    analysis_method: analysis.analysis_method === 'ai-enhanced' ? 'ai-vision-enhanced' : 'vision-enhanced',
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
