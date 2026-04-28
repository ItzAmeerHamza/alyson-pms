/**
 * Vision Validator Edge Function - Standalone version with inlined dependencies
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const HF_API_BASE = 'https://api-inference.huggingface.co/models';
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const HF_VISION_MODEL = 'Qwen/Qwen2-VL-7B-Instruct';

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

async function analyzeScreenshotImage(imageUrl: string): Promise<VisionAnalysisResult> {
  try {
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    const hfToken = Deno.env.get('HF_API_TOKEN');
    const token = geminiKey || hfToken;
    if (!token) {
      throw new Error('Neither GEMINI_API_KEY nor HF_API_TOKEN set');
    }

    const prompt = `Analyze this screenshot and provide a JSON response with the following fields:
1. "detected_content": Brief description of what's visible (max 50 words)
2. "category": One of: "productive", "social_media", "entertainment", "gaming", "shopping", "communication", "other"
3. "is_work_related": true or false
4. "confidence": Number between 0 and 1
5. "privacy_concerns": Array of any privacy concerns (passwords, banking, personal info visible)
6. "is_idle": true if lock screen, screensaver, or login prompt visible

Respond ONLY with valid JSON, no other text.`;

    const useGemini = !!geminiKey;
    const apiUrl = useGemini ? GEMINI_API_URL : `${HF_API_BASE}/${HF_VISION_MODEL}`;
    const modelName = useGemini ? GEMINI_MODEL : HF_VISION_MODEL;
    const body = useGemini
      ? JSON.stringify({
          model: GEMINI_MODEL,
          messages: [{ role: 'user', content: [
            { type: 'image_url', image_url: { url: imageUrl } },
            { type: 'text', text: prompt },
          ]}],
          max_tokens: 500,
        })
      : JSON.stringify({
          inputs: { image: imageUrl, text: prompt },
          parameters: { max_new_tokens: 500 },
        });

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Vision API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    let generatedText = '';
    if (useGemini) {
      generatedText = data.choices?.[0]?.message?.content || '';
    } else if (Array.isArray(data)) {
      generatedText = data[0]?.generated_text || '';
    } else if (data.generated_text) {
      generatedText = data.generated_text;
    }

    // Try to parse as JSON
    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        success: true,
        content: generatedText,
        category: parsed.category || 'other',
        is_work_related: parsed.is_work_related ?? true,
        confidence: parsed.confidence ?? 0.5,
        detected_content: parsed.detected_content || 'Unknown content',
        privacy_concerns: parsed.privacy_concerns || [],
        is_idle: parsed.is_idle ?? false,
        model: modelName,
      };
    }

    // Fallback
    return {
      success: true,
      content: generatedText,
      category: 'other',
      is_work_related: true,
      confidence: 0.5,
      detected_content: generatedText.substring(0, 200),
      privacy_concerns: [],
      is_idle: false,
      model: modelName,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// Main handler
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || 'https://timeflow.ebdaadt.com,http://localhost:8080,http://localhost:5173').split(',').map(o => o.trim());

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.some(o => origin === o) ? origin : ALLOWED_ORIGINS[0];
  const corsHeaders = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  const runId = `vision_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  try {
    console.log(`[${runId}] Starting vision validation...`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing SUPABASE credentials');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get feature flags
    const { data: flags } = await supabase
      .from('vision_feature_flags')
      .select('*')
      .limit(1)
      .single();

    const maxScreenshots = flags?.max_screenshots_per_run || 5;

    if (!flags?.vision_validation_enabled) {
      return new Response(JSON.stringify({ success: true, message: 'Vision validation disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get screenshots to validate
    const { data: screenshots } = await supabase
      .rpc('get_vision_validation_queue', { p_limit: maxScreenshots });

    if (!screenshots || screenshots.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No screenshots pending', queue_empty: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[${runId}] Processing ${screenshots.length} screenshots...`);

    // Process each screenshot
    const results = [];
    for (const screenshot of screenshots) {
      const visionResult = await analyzeScreenshotImage(screenshot.image_url);

      if (visionResult.success) {
        // Update screenshot
        await supabase
          .from('screenshots')
          .update({
            vision_validated_at: new Date().toISOString(),
            vision_category: visionResult.category,
            vision_confidence: visionResult.confidence,
            vision_detected_content: visionResult.detected_content,
            vision_privacy_concerns: visionResult.privacy_concerns || [],
            needs_vision_validation: false,
          })
          .eq('id', screenshot.id);

        // Log API call
        await supabase.from('vision_api_calls_log').insert({
          validator_run_id: runId,
          screenshot_id: screenshot.id,
          request_duration_ms: 1000,
          response_status: 200,
          success: true,
          vision_category: visionResult.category,
          vision_confidence: visionResult.confidence,
          duplicate_confirmed: true,
          privacy_concern_detected: (visionResult.privacy_concerns?.length || 0) > 0,
        });

        results.push({ success: true, screenshot_id: screenshot.id });
      } else {
        results.push({ success: false, screenshot_id: screenshot.id, error: visionResult.error });
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Log metrics
    const successCount = results.filter(r => r.success).length;
    await supabase.from('vision_analysis_metrics').insert({
      validator_run_id: runId,
      execution_duration_ms: Date.now() - startTime,
      screenshots_processed: successCount,
      screenshots_failed: results.length - successCount,
      api_calls_made: results.length,
      status: 'completed',
    });

    return new Response(JSON.stringify({
      success: true,
      run_id: runId,
      screenshots_processed: successCount,
      execution_time_ms: Date.now() - startTime,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error(`[${runId}] Error:`, error);
    return new Response(JSON.stringify({ success: false, error: error.message, run_id: runId }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
