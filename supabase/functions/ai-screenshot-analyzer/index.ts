/**
 * AI Screenshot Analyzer - Enhanced with GLM-4.7 + Vision + Alerts
 * 
 * Features:
 * - Pattern-based analysis (fast, always available)
 * - AI-powered text analysis using GLM-4.7 for context understanding
 * - Vision analysis for image content (optional)
 * - Automatic alert creation for non-work activities
 * - Privacy concern detection
 * - Consecutive duplicate tracking
 * 
 * Required secrets:
 * - GEMINI_API_KEY: Google Gemini API key (preferred)
 * - HF_API_TOKEN: Hugging Face API token (fallback)
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

// Gemini API (OpenAI-compatible endpoint) — falls back to HF if GEMINI_API_KEY not set
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const HF_ROUTER = 'https://router.huggingface.co/v1/chat/completions';
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const HF_TEXT_MODEL = 'THUDM/glm-4-9b-chat';
// NOTE: HF Router support varies by enabled providers; allow override via secret/env.
// `meta-llama/Llama-3.2-11B-Vision-Instruct` is broadly available via HF Inference Providers.
const HF_VISION_MODEL_DEFAULT = 'meta-llama/Llama-3.2-11B-Vision-Instruct';
const HF_BLIP_CAPTION_MODEL = 'Salesforce/blip-image-captioning-large';

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
function getApiUrl(): string {
  return isUsingGemini() ? GEMINI_API_URL : HF_ROUTER;
}
function getTextModelName(): string {
  return isUsingGemini() ? GEMINI_MODEL : HF_TEXT_MODEL;
}
function getVisionModelName(): string {
  if (isUsingGemini()) return GEMINI_MODEL;
  return Deno.env.get('HF_VISION_MODEL') || HF_VISION_MODEL_DEFAULT;
}
function getApiToken(): string {
  return _cachedGeminiKey || Deno.env.get('GEMINI_API_KEY') || Deno.env.get('HF_API_TOKEN') || '';
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

    // Ensure Gemini key is loaded from vault if not in env
    if (!Deno.env.get('GEMINI_API_KEY') && !_cachedGeminiKey) {
      await getGeminiKeyFromVault(supabase);
    }

    const requestBody = await req.json();
    const { 
      screenshot_id, 
      user_id, 
      window_title, 
      app_name,
      use_ai = true,        // Enable AI analysis (GLM-4.7)
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

    const aiToken = getApiToken();
    const CONFIDENCE_THRESHOLD = 90;
    const patternConfident = analysis.confidence_score >= CONFIDENCE_THRESHOLD;

    // Determine if vision should be used (smart detection)
    let shouldUseVision = use_vision;
    let visionReason = '';
    
    if (shouldUseVision === undefined) {
      // Auto-detect when to use vision
      const activityPercent = screenshot.activity_percent || 0;
      const isUnvalidatedDuplicate = screenshot.is_duplicate && !screenshot.vision_validated_at;
      const hasImageUrl = !!imageUrl;
      const alwaysVisionDescription = (Deno.env.get('ALWAYS_VISION_DESCRIPTION') || '').toLowerCase() === 'true';
      const wantsDescription = generate_description === true || alwaysVisionDescription;
      
      if (force_vision) {
        shouldUseVision = true;
        visionReason = 'forced';
      } else if (wantsDescription && hasImageUrl) {
        // Generate a description for the screenshot (vision) even if pattern is confident.
        // This is useful for UX, search, and auditability.
        shouldUseVision = true;
        visionReason = 'generate_description';
      } else if (screenshot.needs_vision_validation && !screenshot.vision_validated_at && !patternConfident) {
        // Only run vision for flagged screenshots when pattern confidence is low
        shouldUseVision = true;
        visionReason = 'flagged_for_validation';
      } else if (activityPercent < 10 && hasImageUrl && !patternConfident) {
        // Low activity AND ambiguous app — might be idle or just reading
        shouldUseVision = true;
        visionReason = 'low_activity';
      } else if (isUnvalidatedDuplicate && hasImageUrl && !patternConfident) {
        shouldUseVision = true;
        visionReason = 'unvalidated_duplicate';
      } else if (Math.random() < 0.03 && hasImageUrl) {
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
    if (use_ai && aiToken && (!patternConfident || force_ai)) {
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
          const aiResult = await analyzeWithAI(titleToAnalyze, appToAnalyze, aiToken);
          if (aiResult.success) {
            analysis = mergeAnalysis(analysis, aiResult);
            aiEnhanced = true;
            console.log('✅ AI analysis enhanced with Gemini');
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
    if (shouldUseVision && aiToken && imageUrl && (!patternConfident || visionForSpecialReason)) {
      try {
        visionResult = await analyzeWithVision(imageUrl, aiToken);
        if (visionResult.success) {
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

    const updateData: any = {
      ai_analysis_status: 'completed',
      category: analysis.category,
      distraction_score: analysis.distraction_score,
      confidence_score: analysis.confidence_score,
      activity_type: analysis.activity_type,
      ai_analyzed_at: new Date().toISOString(),
      ai_model_used: aiEnhanced ? (analysis.ai_model || getTextModelName()) : 'pattern-based',
      is_work_related: !ALERT_CATEGORIES.includes(analysis.category),
      consecutive_duplicate_count: consecutiveDuplicateCount,
      ai_metadata: {
        ...analysis,
        image_description: imageDescription,
        analyzed_at: new Date().toISOString(),
        analysis_version: '4.1.0',
        source: 'ai-screenshot-analyzer',
        ai_enhanced: aiEnhanced,
        vision_used: !!visionResult?.success,
        vision_reason: visionReason,
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
    analysis_method: 'pattern-based',
    window_title_analyzed: windowTitle,
    app_name_analyzed: appName
  };
}

/**
 * AI-enhanced analysis using GLM-4.7
 */
async function analyzeWithAI(windowTitle: string, appName: string, token: string): Promise<any> {
  const systemPrompt = `You are an AI analyzing employee computer activity for a time tracking system.
Analyze the screenshot metadata and respond with ONLY valid JSON:
{
  "category": "productive" | "social_media" | "entertainment" | "gaming" | "shopping" | "communication",
  "activity_type": "string describing the activity",
  "is_work_related": true | false,
  "distraction_score": 0-100,
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation"
}
Consider context: YouTube tutorials are work-related, development forums are productive, etc.`;

  const userMessage = `Window Title: ${windowTitle || 'Unknown'}
Application: ${appName || 'Unknown'}

Respond with ONLY valid JSON.`;

  const textModel = getTextModelName();
  
  for (const model of [textModel]) {
    try {
      const response = await fetch(getApiUrl(), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          max_tokens: 300,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`Model ${model} failed: ${response.status} - ${errorText}`);
        continue; // Try next model
      }

      const result = await response.json();
      let text = result.choices?.[0]?.message?.content || '';

      // Parse JSON from response
      const jsonMatch = text?.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log(`AI analysis succeeded with model: ${model}`);
        return {
          success: true,
          ...parsed,
          ai_model: model
        };
      }
      
      console.warn(`Model ${model} returned unparseable response`);
      continue;
    } catch (error: any) {
      console.warn(`Model ${model} error: ${error.message}`);
      continue;
    }
  }

  return { success: false, error: 'All AI models failed' };
}

/**
 * Vision analysis using Qwen2-VL
 */
async function analyzeWithVision(imageUrl: string, token: string): Promise<any> {
  try {
    const prompt = `Analyze this screenshot and respond with ONLY valid JSON (no other text):
{
  "detected_content": "Brief description of what is visible (max 50 words)",
  "category": "productive | social_media | entertainment | gaming | shopping | communication | other",
  "is_work_related": true or false,
  "confidence": 0.0 to 1.0,
  "privacy_concerns": [],
  "is_idle": false
}

Classification rules:
- productive: IDEs, code editors, terminals, office apps, project management, design tools, file managers (File Explorer, Finder), system utilities, browsers showing work content, admin panels, dashboards
- social_media: Facebook, Instagram, Twitter/X, TikTok, Snapchat, Reddit — personal social feeds
- entertainment: Netflix, YouTube (non-tutorial), Hulu, Disney+, HBO, Twitch streams, Spotify, movies
- gaming: Steam, Epic Games, actual video games, game interfaces
- shopping: Amazon, eBay, personal online shopping on e-commerce sites
- communication: Slack, Teams, Zoom, email clients
- other: anything that doesn't clearly fit

Important: File Explorer, Windows Explorer, Finder, and system utilities are ALWAYS productive. Only classify as non-productive if the content is clearly personal/leisure activity.`;

    const response = await fetch(getApiUrl(), {
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
              { type: 'text', text: prompt }
            ]
          }
        ],
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // HF Router can fail if the requested model isn't available for enabled providers.
      // In that case, fall back to classic HF Inference API for a simple caption so
      // `generate_description` still works without provider configuration.
      const isHfRouter = getApiUrl() === HF_ROUTER;
      const looksLikeModelNotSupported =
        response.status === 400 && /model_not_supported|not supported by any provider/i.test(errorText || '');
      if (isHfRouter && looksLikeModelNotSupported) {
        try {
          const imageResp = await fetch(imageUrl);
          if (!imageResp.ok) {
            const imgErr = await imageResp.text();
            throw new Error(`Failed to fetch image for caption: ${imageResp.status} - ${imgErr}`);
          }
          const imageBytes = new Uint8Array(await imageResp.arrayBuffer());
          const captionResp = await fetch(`https://api-inference.huggingface.co/models/${HF_BLIP_CAPTION_MODEL}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              // Intentionally omit Content-Type; binary body is supported.
            },
            body: imageBytes,
          });

          if (!captionResp.ok) {
            const captionErr = await captionResp.text();
            throw new Error(`HF caption fallback error: ${captionResp.status} - ${captionErr}`);
          }

          const captionJson = await captionResp.json();
          const caption =
            (Array.isArray(captionJson) && captionJson[0]?.generated_text) ? String(captionJson[0].generated_text)
            : (captionJson?.generated_text ? String(captionJson.generated_text) : '');

          if (caption && caption.trim().length > 0) {
            return {
              success: true,
              detected_content: caption.trim(),
              confidence: 0.6,
              model: HF_BLIP_CAPTION_MODEL,
            };
          }
        } catch (fallbackError: any) {
          // If fallback fails, surface both errors for easier debugging.
          throw new Error(`Vision API error: ${response.status} - ${errorText}; fallback_failed: ${fallbackError?.message || String(fallbackError)}`);
        }
      }

      throw new Error(`Vision API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    let text = result.choices?.[0]?.message?.content || '';

    // Try to parse structured JSON response
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const validCategories = ['productive', 'social_media', 'entertainment', 'gaming', 'shopping', 'communication', 'other'];
        return {
          success: true,
          detected_content: parsed.detected_content || text.substring(0, 500),
          category: validCategories.includes(parsed.category) ? parsed.category : undefined,
          is_work_related: parsed.is_work_related,
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
          privacy_concerns: parsed.privacy_concerns || [],
          is_idle: parsed.is_idle || false,
          model: getVisionModelName()
        };
      }
    } catch {
      // JSON parsing failed, return raw text
    }

    return {
      success: true,
      detected_content: text.substring(0, 500),
      model: getVisionModelName()
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Merge AI analysis with pattern analysis
 */
function mergeAnalysis(patternAnalysis: any, aiResult: any): any {
  if (!aiResult.success) return patternAnalysis;

  return {
    ...patternAnalysis,
    category: aiResult.category || patternAnalysis.category,
    activity_type: aiResult.activity_type || patternAnalysis.activity_type,
    distraction_score: aiResult.distraction_score ?? patternAnalysis.distraction_score,
    confidence_score: Math.round((aiResult.confidence || 0.7) * 100),
    is_work_related: aiResult.is_work_related ?? patternAnalysis.is_work_related,
    reasoning: [...patternAnalysis.reasoning, `AI: ${aiResult.reasoning || 'Analysis enhanced with GLM-4.7'}`],
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

console.log('🤖 AI Screenshot Analyzer v4.1 initialized with Smart Confidence Gating (vision + text) + Gemini');
