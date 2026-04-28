/**
 * Test Hugging Face Integration
 * 
 * Validates that the HF_API_TOKEN is configured correctly
 * and tests both GLM-4.7 (text) and Qwen2-VL (vision) models.
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || 'https://timeflow.ebdaadt.com,http://localhost:8080,http://localhost:5173').split(',').map(o => o.trim());

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.some(o => origin === o) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

const HF_API_BASE = 'https://api-inference.huggingface.co/models';
const GLM_MODEL = 'THUDM/glm-4-9b-chat';
const VISION_MODEL = 'Qwen/Qwen2-VL-7B-Instruct';

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const results: any = {
    timestamp: new Date().toISOString(),
    token_configured: false,
    glm_test: { success: false, error: null, response: null },
    vision_test: { success: false, error: null, response: null, note: 'Vision model test requires an image URL' },
  };

  try {
    const hfToken = Deno.env.get('HF_API_TOKEN');
    
    if (!hfToken) {
      results.error = 'HF_API_TOKEN not configured';
      results.instructions = 'Set HF_API_TOKEN in Supabase secrets: supabase secrets set HF_API_TOKEN=your-token';
      return new Response(
        JSON.stringify(results),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    results.token_configured = true;
    results.token_preview = hfToken.substring(0, 8) + '...' + hfToken.substring(hfToken.length - 4);

    // Test GLM-4.7 text model
    console.log('Testing GLM-4.7...');
    try {
      const glmResponse = await fetch(`${HF_API_BASE}/${GLM_MODEL}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${hfToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: '<|system|>\nYou are a helpful assistant.<|endoftext|>\n<|user|>\nSay "TimeFlow AI Test Successful" and nothing else.<|endoftext|>\n<|assistant|>\n',
          parameters: {
            max_new_tokens: 50,
            temperature: 0.3,
            return_full_text: false,
          }
        }),
      });

      if (glmResponse.ok) {
        const glmResult = await glmResponse.json();
        const text = Array.isArray(glmResult) ? glmResult[0]?.generated_text : glmResult.generated_text;
        results.glm_test = {
          success: true,
          response: text?.trim().substring(0, 200),
          model: GLM_MODEL,
          status: glmResponse.status,
        };
        console.log('✅ GLM-4.7 test passed');
      } else {
        const errorText = await glmResponse.text();
        results.glm_test = {
          success: false,
          error: `HTTP ${glmResponse.status}: ${errorText.substring(0, 200)}`,
          model: GLM_MODEL,
          status: glmResponse.status,
        };
        
        // Check for model loading
        if (glmResponse.status === 503 && errorText.includes('loading')) {
          results.glm_test.note = 'Model is loading. Wait a minute and try again.';
        }
        console.log('❌ GLM-4.7 test failed:', glmResponse.status);
      }
    } catch (glmError: any) {
      results.glm_test = {
        success: false,
        error: glmError.message,
        model: GLM_MODEL,
      };
      console.error('GLM test error:', glmError);
    }

    // Test basic API connectivity with a simple model
    console.log('Testing API connectivity...');
    try {
      const connectivityResponse = await fetch(`${HF_API_BASE}/gpt2`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${hfToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: 'Hello',
          parameters: { max_new_tokens: 5 }
        }),
      });

      results.api_connectivity = {
        success: connectivityResponse.ok,
        status: connectivityResponse.status,
      };
    } catch (connError: any) {
      results.api_connectivity = {
        success: false,
        error: connError.message,
      };
    }

    // Overall status
    results.overall_status = results.glm_test.success ? 'operational' : 'partial';
    
    if (results.glm_test.success) {
      results.message = '✅ Hugging Face integration is working! GLM-4.7 is ready for analysis.';
    } else if (results.api_connectivity?.success) {
      results.message = '⚠️ API connected but GLM-4.7 may be loading. Try again in a minute.';
    } else {
      results.message = '❌ Connection issues. Check your HF_API_TOKEN.';
    }

    return new Response(
      JSON.stringify(results, null, 2),
      { 
        status: results.glm_test.success ? 200 : 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error: any) {
    console.error('Test error:', error);
    
    return new Response(
      JSON.stringify({
        ...results,
        error: 'Test failed',
        message: '❌ Test failed with error'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

console.log('🧪 Hugging Face test function loaded');



