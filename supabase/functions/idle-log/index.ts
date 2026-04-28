
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || 'https://timeflow.ebdaadt.com,http://localhost:8080,http://localhost:5173').split(',').map(o => o.trim())

serve(async (req) => {
  const origin = req.headers.get('origin') || ''
  const allowOrigin = ALLOWED_ORIGINS.some(o => origin === o) ? origin : ''
  const corsHeaders = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { user_id, project_id, idle_start, idle_end, duration_seconds, organization_id } = await req.json()

    if (!user_id || !project_id || !idle_start) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: user_id, project_id, idle_start' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Resolve organization_id from request or from user record
    let orgId = organization_id
    if (!orgId) {
      const { data: userData } = await supabaseClient
        .from('users')
        .select('organization_id')
        .eq('id', user_id)
        .single()
      orgId = userData?.organization_id
    }

    const { data, error } = await supabaseClient
      .from('idle_logs')
      .insert({
        user_id,
        project_id,
        idle_start,
        idle_end,
        duration_seconds,
        organization_id: orgId
      })
      .select()

    if (error) {
      console.error('Idle log insert error:', error)
      return new Response(
        JSON.stringify({ error: 'Invalid request' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ data }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Idle log function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
