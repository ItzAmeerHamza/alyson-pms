/**
 * DeepSeek account snapshot for admin cost dashboard (models list + balance).
 * Uses the same DEEPSEEK_API_KEY / vault secret as ai-screenshot-analyzer.
 */
/// <reference types="./types.d.ts" />
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ||
  'https://timeflow.ebdaadt.com,http://localhost:8080,http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.some((o) => origin === o) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function deepseekBase(): string {
  return (Deno.env.get('DEEPSEEK_API_BASE') || 'https://api.deepseek.com').replace(/\/$/, '');
}

let _cachedDeepSeekKey: string | null = null;

async function getDeepSeekKeyFromVault(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  if (_cachedDeepSeekKey) return _cachedDeepSeekKey;
  try {
    const { data } = await supabase.rpc('get_secret', { secret_name: 'DEEPSEEK_API_KEY' }).single();
    if (data?.decrypted_secret) {
      _cachedDeepSeekKey = data.decrypted_secret;
      return _cachedDeepSeekKey;
    }
  } catch {
    /* vault unavailable */
  }
  return null;
}

async function resolveDeepseekToken(svc: ReturnType<typeof createClient>): Promise<string> {
  const envKey = Deno.env.get('DEEPSEEK_API_KEY') || '';
  if (envKey) return envKey;
  return (await getDeepSeekKeyFromVault(svc)) || '';
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const svc = createClient(supabaseUrl, serviceRole);

    const authHeader = req.headers.get('Authorization');
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!bearer) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: authData, error: authErr } = await svc.auth.getUser(bearer);
    if (authErr || !authData?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const uid = authData.user.id;
    const { data: profile, error: profileErr } = await svc
      .from('users')
      .select('role, is_org_admin, is_super_admin')
      .eq('id', uid)
      .maybeSingle();

    if (profileErr || !profile) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const allowed =
      profile.is_super_admin === true ||
      profile.role === 'admin' ||
      profile.is_org_admin === true;

    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = await resolveDeepseekToken(svc);
    if (!token) {
      return new Response(
        JSON.stringify({
          error: 'DeepSeek API key not configured',
          models: null,
          balance: null,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const base = deepseekBase();
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const [modelsRes, balanceRes] = await Promise.all([
      fetch(`${base}/v1/models`, { method: 'GET', headers }),
      fetch(`${base}/user/balance`, { method: 'GET', headers }),
    ]);

    let modelsBody: unknown = null;
    let balanceBody: unknown = null;
    try {
      modelsBody = await modelsRes.json();
    } catch {
      modelsBody = { raw_error: 'invalid_json', status: modelsRes.status };
    }
    try {
      balanceBody = await balanceRes.json();
    } catch {
      balanceBody = { raw_error: 'invalid_json', status: balanceRes.status };
    }

    return new Response(
      JSON.stringify({
        ok: modelsRes.ok && balanceRes.ok,
        models_status: modelsRes.status,
        balance_status: balanceRes.status,
        models: modelsBody,
        balance: balanceBody,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
