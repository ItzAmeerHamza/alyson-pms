import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || 'https://timeflow.ebdaadt.com,http://localhost:8080,http://localhost:5173').split(',').map(o => o.trim());

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.some(o => origin === o) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  // Handle CORS preflight requests
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
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log('🚀 Executing Cron Migration: Update AI Analysis to Work All Day')

    // Execute the migration steps
    const results = []

    // Step 1: Update the priority cron job to run all day, every day
    console.log('Step 1: Updating priority cron job...')
    const step1 = await supabase.rpc('exec_sql', {
      sql: `SELECT cron.alter_job(17, '*/10 * * * *', NULL, NULL, NULL, NULL);`
    })
    results.push({ step: 1, result: step1 })

    // Step 2: Add business hours cron job
    console.log('Step 2: Adding business hours cron job...')
    const step2 = await supabase.rpc('exec_sql', {
      sql: `SELECT cron.schedule('*/5 9-17 * * 1-5', 'SELECT public.run_ai_insights_priority();');`
    })
    results.push({ step: 2, result: step2 })

    // Step 3: Add off-hours cron job
    console.log('Step 3: Adding off-hours cron job...')
    const step3 = await supabase.rpc('exec_sql', {
      sql: `SELECT cron.schedule('0 */2 * * *', 'SELECT public.run_ai_insights_priority();');`
    })
    results.push({ step: 3, result: step3 })

    // Step 4: Update daily cron job
    console.log('Step 4: Updating daily cron job...')
    const step4 = await supabase.rpc('exec_sql', {
      sql: `SELECT cron.alter_job(16, '0 8,20 * * *', NULL, NULL, NULL, NULL);`
    })
    results.push({ step: 4, result: step4 })

    // Step 5: Log the changes
    console.log('Step 5: Logging changes...')
    const step5 = await supabase
      .from('system_logs')
      .insert({
        log_type: 'cron_update',
        message: 'Updated AI analysis cron jobs to work all day using edge function',
        metadata: {
          timestamp: new Date().toISOString(),
          changes: {
            priority_job: '*/10 * * * * (every 10 minutes, all day)',
            business_hours_job: '*/5 9-17 * * 1-5 (every 5 minutes, business hours)',
            off_hours_job: '0 */2 * * * (every 2 hours, all day)',
            daily_job: '0 8,20 * * * (8AM and 8PM daily)'
          },
          reason: 'User requested all-day AI analysis coverage',
          executed_by: 'edge_function',
          method: 'cron_functions'
        }
      })
    results.push({ step: 5, result: step5 })

    // Step 6: Verify the changes
    console.log('Step 6: Verifying cron jobs...')
    const verification = await supabase.rpc('exec_sql', {
      sql: `
        SELECT 
          jobname,
          schedule,
          active,
          CASE 
            WHEN schedule = '*/10 * * * *' THEN '✅ All day coverage (every 10 min)'
            WHEN schedule = '*/5 9-17 * * 1-5' THEN '✅ Business hours (every 5 min)'
            WHEN schedule = '0 */2 * * *' THEN '✅ Off hours (every 2 hours)'
            WHEN schedule = '0 8,20 * * *' THEN '✅ Daily coverage (8AM + 8PM)'
            ELSE '❓ Unknown schedule'
          END as coverage_description
        FROM cron.job 
        WHERE jobname LIKE '%ai-insights%'
        ORDER BY jobname;
      `
    })

    console.log('✅ Migration completed successfully!')

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Cron migration executed successfully! AI analysis now runs 24/7.',
        results: results,
        verification: verification.data,
        summary: {
          priority_job: '*/10 * * * * (every 10 minutes, all day)',
          business_hours_job: '*/5 9-17 * * 1-5 (every 5 minutes, business hours)',
          off_hours_job: '0 */2 * * * (every 2 hours, all day)',
          daily_job: '0 8,20 * * * (8AM and 8PM daily)'
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('❌ Migration failed:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Migration execution failed',
        message: 'Migration failed. Please try using the Supabase Dashboard SQL Editor instead.'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})
