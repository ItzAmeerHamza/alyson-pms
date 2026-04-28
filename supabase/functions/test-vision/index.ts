import { serve } from 'https://deno.land/std@0.178.0/http/server.ts'

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || 'https://timeflow.ebdaadt.com,http://localhost:8080,http://localhost:5173').split(',').map(o => o.trim());

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.some(o => origin === o) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

const HF_API_BASE = 'https://router.huggingface.co/v1/chat/completions'
const VISION_MODEL = 'Qwen/Qwen2.5-VL-7B-Instruct'

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const hfToken = Deno.env.get('HF_API_TOKEN')
    if (!hfToken) {
      return new Response(JSON.stringify({ error: 'HF_API_TOKEN not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { image_url } = await req.json().catch(() => ({}))
    
    // Test with a sample image if none provided
    const testImageUrl = image_url || 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png'

    const response = await fetch(HF_API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${hfToken}`
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What do you see in this image? Describe it briefly.' },
              { type: 'image_url', image_url: { url: testImageUrl } }
            ]
          }
        ],
        max_tokens: 300
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      return new Response(JSON.stringify({ 
        error: `Vision API error ${response.status}`,
        details: errText,
        model: VISION_MODEL
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const data = await response.json()
    
    return new Response(JSON.stringify({
      success: true,
      model: VISION_MODEL,
      image_url: testImageUrl,
      vision_response: data.choices?.[0]?.message?.content || 'No response',
      raw: data
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ 
      error: error?.message || String(error),
      model: VISION_MODEL
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

