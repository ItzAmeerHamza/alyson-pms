/**
 * Test Vision API - Debug HF Vision Model
 */

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || 'https://timeflow.ebdaadt.com,http://localhost:8080,http://localhost:5173').split(',').map(o => o.trim());

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

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const token = Deno.env.get('HF_API_TOKEN');
    console.log('[Test] HF_API_TOKEN exists:', !!token);
    console.log('[Test] Token length:', token?.length || 0);

    if (!token) {
      return new Response(JSON.stringify({ 
        error: 'HF_API_TOKEN not found in environment',
        env_vars: Object.keys(Deno.env.toObject())
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Test with a sample image
    const testImageUrl = 'https://fkpiqcxkmrtaetvfgcli.supabase.co/storage/v1/object/public/screenshots/7e5882cc-84f3-4062-bcb0-cdd8b979d7dd/2026-01-08T10-13-34-011Z.png';
    const model = 'Qwen/Qwen2-VL-7B-Instruct';
    
    console.log('[Test] Calling HF API:', model);
    console.log('[Test] Image URL:', testImageUrl);

    const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: {
          image: testImageUrl,
          text: 'What is in this image?'
        },
        parameters: { max_new_tokens: 100 },
      }),
    });

    console.log('[Test] HF Response status:', response.status);
    console.log('[Test] HF Response headers:', Object.fromEntries(response.headers.entries()));

    const data = await response.text();
    console.log('[Test] HF Response body:', data);

    return new Response(JSON.stringify({
      success: response.ok,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: data,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[Test] Error:', error);
    console.error('[Test] Stack:', error.stack);
    return new Response(JSON.stringify({
      error: 'Internal server error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
