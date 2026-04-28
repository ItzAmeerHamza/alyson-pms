/**
 * Comprehensive Employee Analysis with Gemini
 * 
 * Generates AI-powered productivity insights and summaries
 * using Google Gemini for natural language generation.
 * 
 * Required secrets:
 * - GEMINI_API_KEY: Google Gemini API key (preferred)
 * - HF_API_TOKEN: Hugging Face API token (fallback)
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { mergedTotalHours } from '../_shared/time-merge.ts';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || 'https://timeflow.ebdaadt.com,http://localhost:8080,http://localhost:5173').split(',').map(o => o.trim());

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.some(o => origin === o) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

// Gemini API (OpenAI-compatible endpoint) — falls back to HF
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const HF_API_BASE = 'https://api-inference.huggingface.co/models';
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const HF_TEXT_MODEL = 'THUDM/glm-4-9b-chat';

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

function getAnalysisApiConfig(): { token: string; useGemini: boolean } {
  const geminiKey = _cachedGeminiKey || Deno.env.get('GEMINI_API_KEY');
  if (geminiKey) return { token: geminiKey, useGemini: true };
  const hfToken = Deno.env.get('HF_API_TOKEN');
  if (hfToken) return { token: hfToken, useGemini: false };
  return { token: '', useGemini: false };
}

async function runAnalysisForUser(args: {
  supabase: any;
  corsHeaders: Record<string, string>;
  userId: string;
  generateAiSummary: boolean;
}): Promise<Response> {
  const { supabase, corsHeaders, userId, generateAiSummary } = args;

  console.log('🤖 Starting comprehensive analysis for user:', userId);

  // Get employee data (including organization_id)
  const { data: employee, error: employeeError } = await supabase
    .from('users')
    .select('id, email, full_name, role, organization_id')
    .eq('id', userId)
    .single();

  if (employeeError || !employee) {
    return new Response(
      JSON.stringify({ error: 'Employee not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get screenshot analysis data (last 24 hours)
  const sinceTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  let screenshotsQuery = supabase
    .from('screenshots')
    .select('id, category, distraction_score, activity_type, confidence_score, ai_metadata, captured_at, app_name, window_title, is_work_related, consecutive_duplicate_count, activity_percent')
    .eq('user_id', userId)
    .eq('ai_analysis_status', 'completed')
    .gte('captured_at', sinceTime)
    .order('captured_at', { ascending: false });
  if (employee.organization_id) {
    screenshotsQuery = screenshotsQuery.eq('organization_id', employee.organization_id);
  }
  const { data: recentScreenshots, error: screenshotError } = await screenshotsQuery;

  if (screenshotError) {
    console.error('Error fetching screenshots:', screenshotError);
  }

  // Get app usage data
  let appLogsQuery = supabase
    .from('app_logs')
    .select('app_name, duration_seconds')
    .eq('user_id', userId)
    .gte('created_at', sinceTime);
  if (employee.organization_id) {
    appLogsQuery = appLogsQuery.eq('organization_id', employee.organization_id);
  }
  const { data: appLogs } = await appLogsQuery;

  // Get URL logs
  let urlLogsQuery = supabase
    .from('url_logs')
    .select('domain, duration_seconds')
    .eq('user_id', userId)
    .gte('timestamp', sinceTime);
  if (employee.organization_id) {
    urlLogsQuery = urlLogsQuery.eq('organization_id', employee.organization_id);
  }
  const { data: urlLogs } = await urlLogsQuery;

  // Get active alerts for this user (scoped to org if available)
  let alertsQuery = supabase
    .from('admin_alerts')
    .select('alert_type, severity, title, message')
    .eq('user_id', userId)
    .eq('acknowledged', false)
    .order('created_at', { ascending: false })
    .limit(10);
  if (employee.organization_id) {
    alertsQuery = alertsQuery.eq('organization_id', employee.organization_id);
  }
  const { data: activeAlerts } = await alertsQuery;

  // Calculate metrics
  let totalScreenshots = recentScreenshots?.length || 0;
  let productiveScreenshots = 0;
  let distractionScore = 0;
  let activityBreakdown: Record<string, number> = {};
  let categoryBreakdown: Record<string, number> = {};
  let privacyRiskCount = 0;
  let consecutiveDuplicateMax = 0;
  let nonWorkScreenshots = 0;
  let activityPercentSum = 0; // Sum of real keyboard/mouse activity_percent values

  if (recentScreenshots && recentScreenshots.length > 0) {
    recentScreenshots.forEach((screenshot: any) => {
      // Count productive vs distracting
      if (screenshot.category === 'productive' || screenshot.is_work_related) {
        productiveScreenshots++;
      } else {
        nonWorkScreenshots++;
      }

      // Category breakdown
      const category = screenshot.category || 'unknown';
      categoryBreakdown[category] = (categoryBreakdown[category] || 0) + 1;

      // Accumulate distraction scores
      if (screenshot.distraction_score) {
        distractionScore += screenshot.distraction_score;
      }

      // Activity breakdown
      const activityType = screenshot.activity_type || 'unknown';
      activityBreakdown[activityType] = (activityBreakdown[activityType] || 0) + 1;

      // Privacy risk detection
      if (screenshot.ai_metadata?.privacy_risk_score > 50) {
        privacyRiskCount++;
      }

      // Track max consecutive duplicates
      if (screenshot.consecutive_duplicate_count > consecutiveDuplicateMax) {
        consecutiveDuplicateMax = screenshot.consecutive_duplicate_count;
      }

      // Accumulate real keyboard/mouse activity
      activityPercentSum += (screenshot.activity_percent ?? 0);
    });

    distractionScore = totalScreenshots > 0 ? Math.round(distractionScore / totalScreenshots) : 0;
  }

  // Calculate top apps
  const appUsage: Record<string, number> = {};
  (appLogs || []).forEach((log: any) => {
    if (log.app_name) {
      appUsage[log.app_name] = (appUsage[log.app_name] || 0) + (log.duration_seconds || 0);
    }
  });
  const topApps = Object.entries(appUsage)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, seconds]) => ({ name, hours: Math.round(seconds / 3600 * 10) / 10 }));

  // Calculate top sites
  const siteUsage: Record<string, number> = {};
  (urlLogs || []).forEach((log: any) => {
    if (log.domain) {
      siteUsage[log.domain] = (siteUsage[log.domain] || 0) + (log.duration_seconds || 0);
    }
  });
  const topSites = Object.entries(siteUsage)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, seconds]) => ({ name, hours: Math.round(seconds / 3600 * 10) / 10 }));

  // Calculate productivity score blending AI category score with real activity
  let productivityScore = 75; // default when no screenshots
  if (totalScreenshots > 0) {
    const categoryScore = (productiveScreenshots / totalScreenshots) * 100;
    const realAvgActivity = activityPercentSum / totalScreenshots;
    
    const blendedScore = (categoryScore * 0.5) + (realAvgActivity * 0.5);
    
    const idlePenalty = consecutiveDuplicateMax > 30 ? 15 :
      consecutiveDuplicateMax > 15 ? 10 :
      consecutiveDuplicateMax > 5 ? 5 : 0;
    
    const distractionPenalty = distractionScore > 50 ? 10 :
      distractionScore > 30 ? 5 : 0;
    
    productivityScore = Math.round(Math.max(0, Math.min(100, blendedScore - idlePenalty - distractionPenalty)));
    
    if (productivityScore === 100 && distractionScore === 0 && nonWorkScreenshots === 0) {
      productivityScore = 95;
    }
  }

  const nonWorkPercentage = totalScreenshots > 0 
    ? (nonWorkScreenshots / totalScreenshots) * 100 
    : 0;

  const distractingCategories = ['gaming', 'social_media', 'entertainment', 'shopping'];
  const distractingCount = distractingCategories.reduce((sum, cat) => 
    sum + (categoryBreakdown[cat] || 0), 0
  );
  const distractingPercentage = totalScreenshots > 0 
    ? (distractingCount / totalScreenshots) * 100 
    : 0;

  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  let riskReasons: string[] = [];

  if (activeAlerts && activeAlerts.some((a: any) => a.severity === 'critical' || a.severity === 'high')) {
    riskLevel = 'high';
    riskReasons.push('Critical/high severity alerts present');
  } else if (productivityScore < 40) {
    riskLevel = 'high';
    riskReasons.push(`Very low productivity (${productivityScore}%)`);
  } else if (distractionScore > 60) {
    riskLevel = 'high';
    riskReasons.push(`High distraction score (${distractionScore}%)`);
  } else if (distractingPercentage > 40) {
    riskLevel = 'high';
    riskReasons.push(`Excessive non-work activity (${Math.round(distractingPercentage)}% distracting)`);
  } else if (consecutiveDuplicateMax > 30) {
    riskLevel = 'high';
    riskReasons.push(`Extended idle period (${consecutiveDuplicateMax} consecutive duplicates)`);
  }

  if (riskLevel !== 'high') {
    if (activeAlerts && activeAlerts.length > 0) {
      riskLevel = 'medium';
      riskReasons.push(`${activeAlerts.length} active alert(s)`);
    } else if (productivityScore < 60) {
      riskLevel = 'medium';
      riskReasons.push(`Below-average productivity (${productivityScore}%)`);
    } else if (nonWorkPercentage > 20) {
      riskLevel = 'medium';
      riskReasons.push(`Elevated non-work activity (${Math.round(nonWorkPercentage)}%)`);
    } else if (distractionScore > 40) {
      riskLevel = 'medium';
      riskReasons.push(`Moderate distraction score (${distractionScore}%)`);
    } else if (consecutiveDuplicateMax > 15) {
      riskLevel = 'medium';
      riskReasons.push(`Notable idle periods (${consecutiveDuplicateMax} consecutive duplicates)`);
    } else if (distractingPercentage > 20) {
      riskLevel = 'medium';
      riskReasons.push(`Notable distracting activity (${Math.round(distractingPercentage)}%)`);
    }
  }

  // Query actual hours from time_logs for accurate total_hours
  let actualTotalHours = 0;
  try {
    const { data: timeLogs } = await supabase
      .from('time_logs')
      .select('start_time, end_time')
      .eq('user_id', employee.id)
      .gte('start_time', sinceTime)
      .not('end_time', 'is', null);

    if (timeLogs && timeLogs.length > 0) {
      actualTotalHours = Math.round(mergedTotalHours(timeLogs) * 10) / 10; // 1 decimal
    }
  } catch (e) {
    console.warn('Failed to query time_logs for hours:', e);
  }

  const computedTotalHours = actualTotalHours > 0
    ? actualTotalHours
    : totalScreenshots > 0
      ? Math.max(1, Math.round(totalScreenshots * 0.1))
      : 0;

  let aiSummary = null;
  const { token: aiToken, useGemini } = getAnalysisApiConfig();
  
  if (generateAiSummary && aiToken && totalScreenshots > 0) {
    try {
      aiSummary = await generateAISummary(aiToken, useGemini, {
        employeeName: employee.full_name || 'Employee',
        totalScreenshots,
        productiveScreenshots,
        nonWorkScreenshots,
        productivityScore,
        distractionScore,
        topApps,
        topSites,
        activityBreakdown,
        categoryBreakdown,
        alertCount: activeAlerts?.length || 0,
        consecutiveDuplicateMax,
        privacyRiskCount,
      });
      console.log('✅ AI summary generated');
    } catch (aiError) {
      console.warn('⚠️ AI summary generation failed:', aiError);
    }
  }

  // Guard: only insert insights if there is recent activity
  const { count: recentTimeLogsCount } = await supabase
    .from('time_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', employee.id)
    .gte('start_time', sinceTime);

  const hasRecentActivity = (recentTimeLogsCount || 0) > 0 || totalScreenshots > 0;

  if (!hasRecentActivity) {
    console.log('⏭️ Skipping insights insert: no recent activity for user', employee.id);
    return new Response(
      JSON.stringify({
        success: true,
        skipped: true,
        reason: 'no_recent_activity',
        message: 'No recent activity found; insights not inserted.'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const analysis = {
    user_id: employee.id,
    employee_name: employee.full_name || 'Unknown',
    employee_role: employee.role || 'Employee',
    executive_summary: aiSummary?.executive_summary || buildFallbackSummary(employee.full_name || 'Employee', topApps, topSites, productivityScore, distractionScore, totalScreenshots, computedTotalHours),
    work_description: aiSummary?.work_description || buildFallbackWorkDescription(topApps, topSites),
    productivity_insights: {
      overall_productivity_score: productivityScore,
      peak_performance_hours: aiSummary?.peak_hours || ['9:00 AM - 11:00 AM', '2:00 PM - 4:00 PM'],
      improvement_suggestions: aiSummary?.suggestions || [
        distractionScore > 50 ? 'Consider reducing distracting activities during work hours' : null,
        productivityScore < 70 ? 'Focus on increasing productive work time' : null,
        'Maintain current productivity levels'
      ].filter(Boolean)
    },
    security_analysis: {
      risk_level: riskLevel,
      active_alerts: activeAlerts?.length || 0,
      suspicious_activities: activeAlerts?.map((a: any) => a.title) || [],
      security_recommendations: privacyRiskCount > 0 ? [
        'Review screenshots with high privacy risk scores',
        'Ensure sensitive information is not captured'
      ] : ['Continue following security best practices']
    },
    screenshot_analysis: {
      total_analyzed: totalScreenshots,
      productive_count: productiveScreenshots,
      non_work_count: nonWorkScreenshots,
      distraction_score: distractionScore,
      activity_breakdown: activityBreakdown,
      category_breakdown: categoryBreakdown,
      privacy_risk_count: privacyRiskCount,
      max_consecutive_duplicates: consecutiveDuplicateMax,
      analysis_coverage: '24-hour coverage'
    },
    app_analysis: { top_apps: topApps, top_sites: topSites },
    ai_generated: !!aiSummary,
    ai_insights: aiSummary,
  };

  const { error: saveError } = await supabase
    .from('ai_employee_insights')
    .insert({
      user_id: employee.id,
      organization_id: employee.organization_id || null,
      analysis_type: 'comprehensive',
      period_start: sinceTime,
      period_end: new Date().toISOString(),
      insights: {
        productivity_score: productivityScore,
        risk_level: riskLevel,
        risk_reasons: riskReasons,
        activity_percentage: totalScreenshots > 0 ? Math.round(activityPercentSum / totalScreenshots) : 0,
        total_hours: computedTotalHours,
        screenshots_analyzed: totalScreenshots,
        period_type: 'day',
        productivity_indicators: analysis.productivity_insights,
        distraction_indicators: {
          distraction_score: distractionScore,
          non_work_count: nonWorkScreenshots,
          non_work_percentage: Math.round(nonWorkPercentage),
          distracting_percentage: Math.round(distractingPercentage),
          common_distractions: Object.entries(categoryBreakdown)
            .filter(([cat]) => distractingCategories.includes(cat))
            .map(([cat, count]) => `${cat}: ${count}`)
        },
        behavioral_patterns: {
          work_style: aiSummary?.work_style || 'Standard analysis',
          top_apps: topApps.map(a => a.name).join(', '),
          time_management: aiSummary?.time_management || 'Normal patterns',
          consecutive_idle_max: consecutiveDuplicateMax,
          suspicious_activities: riskLevel !== 'low' ? riskReasons : []
        },
        screenshot_insights: analysis.screenshot_analysis,
        executive_summary: analysis.executive_summary,
        work_description: analysis.work_description,
        ai_suggestions: aiSummary?.suggestions || [],
        improvement_suggestions: aiSummary?.suggestions || generateDefaultSuggestions({
          distractionScore,
          consecutiveDuplicateMax,
          nonWorkScreenshots,
          totalScreenshots,
          productivityScore
        }),
        focus_areas: aiSummary?.focus_areas || getDefaultFocusAreas(topApps, categoryBreakdown),
      },
      confidence_score: totalScreenshots > 10 ? 0.9 : totalScreenshots > 0 ? 0.7 : 0.5,
      ai_model: aiSummary ? (useGemini ? GEMINI_MODEL : HF_TEXT_MODEL) : 'statistical-analysis',
      analysis_version: '3.1.0'
    });

  if (saveError) {
    console.error('Failed to save analysis:', saveError);
  }

  return new Response(
    JSON.stringify({
      success: true,
      analysis,
      message: 'Comprehensive employee analysis completed successfully',
      ai_enhanced: !!aiSummary,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

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

    // ---- Auth (required) ----
    // This function may be configured with verify_jwt = false to avoid gateway failures
    // when projects issue ES256 tokens. In that case we must enforce auth manually here.
    const authHeader = req.headers.get('authorization') || '';
    const cronKey = req.headers.get('x-cron-key') || '';
    const expectedCronKey = Deno.env.get('CRON_KEY') || '';

    let authedUserId: string | null = null;

    if (authHeader.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.slice('bearer '.length).trim();
      const supabaseAnon = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      );
      const { data: userData, error: userErr } = await supabaseAnon.auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      authedUserId = userData.user.id;
    } else if (expectedCronKey && cronKey === expectedCronKey) {
      // Allow scheduled jobs without user JWT.
      authedUserId = null;
    } else {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ensure Gemini key is loaded from vault if not in env
    if (!Deno.env.get('GEMINI_API_KEY') && !_cachedGeminiKey) {
      await getGeminiKeyFromVault(supabase);
    }

    const body = await req.json();
    const {
      user_id,
      organization_id,
      limit = 50,
      generate_ai_summary = true,
    } = body || {};

    // Bulk mode: allow org-wide processing when user_id is omitted.
    // Used by the web admin "Analyze" action.
    if (!user_id) {
      if (!organization_id) {
        return new Response(
          JSON.stringify({ error: 'user_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Only admins/managers can run org-wide analysis
      if (authedUserId) {
        const { data: caller } = await supabase
          .from('users')
          .select('id, role, organization_id')
          .eq('id', authedUserId)
          .maybeSingle();
        const role = caller?.role || 'employee';
        if (role !== 'admin' && role !== 'manager') {
          return new Response(
            JSON.stringify({ error: 'Forbidden' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        // If caller is not super-admin, scope to their org only
        if (caller?.organization_id && caller.organization_id !== organization_id) {
          return new Response(
            JSON.stringify({ error: 'Forbidden' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      const { data: orgUsers, error: orgUsersErr } = await supabase
        .from('users')
        .select('id')
        .eq('organization_id', organization_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(Math.max(1, Math.min(500, Number(limit) || 50)));

      if (orgUsersErr) {
        return new Response(
          JSON.stringify({ error: 'Failed to fetch organization users' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const ids = (orgUsers || []).map((u: any) => u.id).filter(Boolean);
      const results: any[] = [];
      let successCount = 0;
      let failedCount = 0;
      let skippedCount = 0;

      for (const id of ids) {
        try {
          const resp = await runAnalysisForUser({
            supabase,
            corsHeaders,
            userId: id,
            generateAiSummary: !!generate_ai_summary,
          });
          const payload = await resp.json().catch(() => null);
          results.push({ user_id: id, ...(payload || { success: false, error: 'invalid_response' }) });
          if (payload?.skipped) skippedCount++;
          else successCount++;
        } catch (e: any) {
          failedCount++;
          results.push({ user_id: id, success: false, error: e?.message || 'analysis_failed' });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          bulk: true,
          organization_id,
          requested_limit: limit,
          processed: ids.length,
          successCount,
          skippedCount,
          failedCount,
          results,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authorization rule:
    // - If called with a user JWT, only allow analyzing self unless the caller is admin/manager.
    if (authedUserId) {
      if (authedUserId !== user_id) {
        const { data: caller } = await supabase
          .from('users')
          .select('id, role')
          .eq('id', authedUserId)
          .maybeSingle();
        const role = caller?.role || 'employee';
        if (role !== 'admin' && role !== 'manager') {
          return new Response(
            JSON.stringify({ error: 'Forbidden' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    return await runAnalysisForUser({
      supabase,
      corsHeaders,
      userId: user_id,
      generateAiSummary: !!generate_ai_summary,
    });

    // (unreachable - runAnalysisForUser returns)

    // Get employee data (including organization_id)
    const { data: employee, error: employeeError } = await supabase
      .from('users')
      .select('id, email, full_name, role, organization_id')
      .eq('id', user_id)
      .single();

    if (employeeError || !employee) {
      return new Response(
        JSON.stringify({ error: 'Employee not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get screenshot analysis data (last 24 hours)
    const sinceTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    let screenshotsQuery = supabase
      .from('screenshots')
      .select('id, category, distraction_score, activity_type, confidence_score, ai_metadata, captured_at, app_name, window_title, is_work_related, consecutive_duplicate_count, activity_percent')
      .eq('user_id', user_id)
      .eq('ai_analysis_status', 'completed')
      .gte('captured_at', sinceTime)
      .order('captured_at', { ascending: false });
    if (employee.organization_id) {
      screenshotsQuery = screenshotsQuery.eq('organization_id', employee.organization_id);
    }
    const { data: recentScreenshots, error: screenshotError } = await screenshotsQuery;

    if (screenshotError) {
      console.error('Error fetching screenshots:', screenshotError);
    }

    // Get app usage data
    let appLogsQuery = supabase
      .from('app_logs')
      .select('app_name, duration_seconds')
      .eq('user_id', user_id)
      .gte('created_at', sinceTime);
    if (employee.organization_id) {
      appLogsQuery = appLogsQuery.eq('organization_id', employee.organization_id);
    }
    const { data: appLogs } = await appLogsQuery;

    // Get URL logs
    let urlLogsQuery = supabase
      .from('url_logs')
      .select('domain, duration_seconds')
      .eq('user_id', user_id)
      .gte('timestamp', sinceTime);
    if (employee.organization_id) {
      urlLogsQuery = urlLogsQuery.eq('organization_id', employee.organization_id);
    }
    const { data: urlLogs } = await urlLogsQuery;

    // Get active alerts for this user (scoped to org if available)
    let alertsQuery = supabase
      .from('admin_alerts')
      .select('alert_type, severity, title, message')
      .eq('user_id', user_id)
      .eq('acknowledged', false)
      .order('created_at', { ascending: false })
      .limit(10);
    if (employee.organization_id) {
      alertsQuery = alertsQuery.eq('organization_id', employee.organization_id);
    }
    const { data: activeAlerts } = await alertsQuery;

    // Calculate metrics
    let totalScreenshots = recentScreenshots?.length || 0;
    let productiveScreenshots = 0;
    let distractionScore = 0;
    let activityBreakdown: Record<string, number> = {};
    let categoryBreakdown: Record<string, number> = {};
    let privacyRiskCount = 0;
    let consecutiveDuplicateMax = 0;
    let nonWorkScreenshots = 0;
    let activityPercentSum = 0; // Sum of real keyboard/mouse activity_percent values

    if (recentScreenshots && recentScreenshots.length > 0) {
      recentScreenshots.forEach(screenshot => {
        // Count productive vs distracting
        if (screenshot.category === 'productive' || screenshot.is_work_related) {
          productiveScreenshots++;
        } else {
          nonWorkScreenshots++;
        }

        // Category breakdown
        const category = screenshot.category || 'unknown';
        categoryBreakdown[category] = (categoryBreakdown[category] || 0) + 1;

        // Accumulate distraction scores
        if (screenshot.distraction_score) {
          distractionScore += screenshot.distraction_score;
        }

        // Activity breakdown
        const activityType = screenshot.activity_type || 'unknown';
        activityBreakdown[activityType] = (activityBreakdown[activityType] || 0) + 1;

        // Privacy risk detection
        if (screenshot.ai_metadata?.privacy_risk_score > 50) {
          privacyRiskCount++;
        }

        // Track max consecutive duplicates
        if (screenshot.consecutive_duplicate_count > consecutiveDuplicateMax) {
          consecutiveDuplicateMax = screenshot.consecutive_duplicate_count;
        }

        // Accumulate real keyboard/mouse activity
        activityPercentSum += (screenshot.activity_percent ?? 0);
      });

      distractionScore = totalScreenshots > 0 ? Math.round(distractionScore / totalScreenshots) : 0;
    }

    // Calculate top apps
    const appUsage: Record<string, number> = {};
    (appLogs || []).forEach((log: any) => {
      if (log.app_name) {
        appUsage[log.app_name] = (appUsage[log.app_name] || 0) + (log.duration_seconds || 0);
      }
    });
    const topApps = Object.entries(appUsage)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, seconds]) => ({ name, hours: Math.round(seconds / 3600 * 10) / 10 }));

    // Calculate top sites
    const siteUsage: Record<string, number> = {};
    (urlLogs || []).forEach((log: any) => {
      if (log.domain) {
        siteUsage[log.domain] = (siteUsage[log.domain] || 0) + (log.duration_seconds || 0);
      }
    });
    const topSites = Object.entries(siteUsage)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, seconds]) => ({ name, hours: Math.round(seconds / 3600 * 10) / 10 }));

    // Calculate productivity score blending AI category score with real activity
    let productivityScore = 75; // default when no screenshots
    if (totalScreenshots > 0) {
      const categoryScore = (productiveScreenshots / totalScreenshots) * 100;
      const realAvgActivity = activityPercentSum / totalScreenshots;
      
      // Blend: 50% AI category classification + 50% real keyboard/mouse activity
      // This prevents 100% scores when users have "productive" category but 0% input activity
      const blendedScore = (categoryScore * 0.5) + (realAvgActivity * 0.5);
      
      // Penalty for consecutive idle/duplicate periods
      const idlePenalty = consecutiveDuplicateMax > 30 ? 15 :
        consecutiveDuplicateMax > 15 ? 10 :
        consecutiveDuplicateMax > 5 ? 5 : 0;
      
      // Penalty for high average distraction score
      const distractionPenalty = distractionScore > 50 ? 10 :
        distractionScore > 30 ? 5 : 0;
      
      productivityScore = Math.round(Math.max(0, Math.min(100, blendedScore - idlePenalty - distractionPenalty)));
      
      // Cap at 95% when everything looks perfect
      if (productivityScore === 100 && distractionScore === 0 && nonWorkScreenshots === 0) {
        productivityScore = 95;
      }
    }

    // Calculate non-work percentage for risk assessment
    const nonWorkPercentage = totalScreenshots > 0 
      ? (nonWorkScreenshots / totalScreenshots) * 100 
      : 0;

    // Count distracting category screenshots
    const distractingCategories = ['gaming', 'social_media', 'entertainment', 'shopping'];
    const distractingCount = distractingCategories.reduce((sum, cat) => 
      sum + (categoryBreakdown[cat] || 0), 0
    );
    const distractingPercentage = totalScreenshots > 0 
      ? (distractingCount / totalScreenshots) * 100 
      : 0;

    // Determine risk level with improved thresholds
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    let riskReasons: string[] = [];

    // HIGH RISK conditions
    if (activeAlerts && activeAlerts.some((a: any) => a.severity === 'critical' || a.severity === 'high')) {
      riskLevel = 'high';
      riskReasons.push('Critical/high severity alerts present');
    } else if (productivityScore < 40) {
      riskLevel = 'high';
      riskReasons.push(`Very low productivity (${productivityScore}%)`);
    } else if (distractionScore > 60) {
      riskLevel = 'high';
      riskReasons.push(`High distraction score (${distractionScore}%)`);
    } else if (distractingPercentage > 40) {
      riskLevel = 'high';
      riskReasons.push(`Excessive non-work activity (${Math.round(distractingPercentage)}% distracting)`);
    } else if (consecutiveDuplicateMax > 30) {
      riskLevel = 'high';
      riskReasons.push(`Extended idle period (${consecutiveDuplicateMax} consecutive duplicates)`);
    }

    // MEDIUM RISK conditions (only if not already high)
    if (riskLevel !== 'high') {
      if (activeAlerts && activeAlerts.length > 0) {
        riskLevel = 'medium';
        riskReasons.push(`${activeAlerts.length} active alert(s)`);
      } else if (productivityScore < 60) {
        riskLevel = 'medium';
        riskReasons.push(`Below-average productivity (${productivityScore}%)`);
      } else if (nonWorkPercentage > 20) {
        riskLevel = 'medium';
        riskReasons.push(`Elevated non-work activity (${Math.round(nonWorkPercentage)}%)`);
      } else if (distractionScore > 40) {
        riskLevel = 'medium';
        riskReasons.push(`Moderate distraction score (${distractionScore}%)`);
      } else if (consecutiveDuplicateMax > 15) {
        riskLevel = 'medium';
        riskReasons.push(`Notable idle periods (${consecutiveDuplicateMax} consecutive duplicates)`);
      } else if (distractingPercentage > 20) {
        riskLevel = 'medium';
        riskReasons.push(`Notable distracting activity (${Math.round(distractingPercentage)}%)`);
      }
    }

    console.log(`📊 Risk assessment: ${riskLevel}`, {
      productivityScore,
      distractionScore,
      nonWorkPercentage: Math.round(nonWorkPercentage),
      distractingPercentage: Math.round(distractingPercentage),
      consecutiveDuplicateMax,
      alertCount: activeAlerts?.length || 0,
      reasons: riskReasons
    });

    // Generate AI summary if enabled
    let aiSummary = null;
    const { token: aiToken, useGemini } = getAnalysisApiConfig();
    
    if (generate_ai_summary && aiToken && totalScreenshots > 0) {
      try {
        aiSummary = await generateAISummary(aiToken, useGemini, {
          employeeName: employee.full_name || 'Employee',
          totalScreenshots,
          productiveScreenshots,
          nonWorkScreenshots,
          productivityScore,
          distractionScore,
          topApps,
          topSites,
          activityBreakdown,
          categoryBreakdown,
          alertCount: activeAlerts?.length || 0,
          consecutiveDuplicateMax,
          privacyRiskCount,
        });
        console.log('✅ AI summary generated');
      } catch (aiError) {
        console.warn('⚠️ AI summary generation failed:', aiError);
      }
    }

    // Query actual hours from time_logs for accurate total_hours
    let actualTotalHours = 0;
    try {
      const { data: timeLogs } = await supabase
        .from('time_logs')
        .select('start_time, end_time')
        .eq('user_id', employee.id)
        .gte('start_time', sinceTime)
        .not('end_time', 'is', null);

      if (timeLogs && timeLogs.length > 0) {
        actualTotalHours = Math.round(mergedTotalHours(timeLogs) * 10) / 10; // 1 decimal
      }
    } catch (e) {
      console.warn('Failed to query time_logs for hours:', e);
    }
    // Fallback: estimate from screenshots but ensure at least 1 hour if there are screenshots
    const computedTotalHours = actualTotalHours > 0
      ? actualTotalHours
      : totalScreenshots > 0
        ? Math.max(1, Math.round(totalScreenshots * 0.1))
        : 0;

    // Build analysis object
    const analysis = {
      user_id: employee.id,
      employee_name: employee.full_name || 'Unknown',
      employee_role: employee.role || 'Employee',
      executive_summary: aiSummary?.executive_summary || buildFallbackSummary(employee.full_name || 'Employee', topApps, topSites, productivityScore, distractionScore, totalScreenshots, computedTotalHours),
      work_description: aiSummary?.work_description || buildFallbackWorkDescription(topApps, topSites),
      productivity_insights: {
        overall_productivity_score: productivityScore,
        peak_performance_hours: aiSummary?.peak_hours || ['9:00 AM - 11:00 AM', '2:00 PM - 4:00 PM'],
        improvement_suggestions: aiSummary?.suggestions || [
          distractionScore > 50 ? 'Consider reducing distracting activities during work hours' : null,
          productivityScore < 70 ? 'Focus on increasing productive work time' : null,
          'Maintain current productivity levels'
        ].filter(Boolean)
      },
      security_analysis: {
        risk_level: riskLevel,
        active_alerts: activeAlerts?.length || 0,
        suspicious_activities: activeAlerts?.map((a: any) => a.title) || [],
        security_recommendations: privacyRiskCount > 0 ? [
          'Review screenshots with high privacy risk scores',
          'Ensure sensitive information is not captured'
        ] : ['Continue following security best practices']
      },
      screenshot_analysis: {
        total_analyzed: totalScreenshots,
        productive_count: productiveScreenshots,
        non_work_count: nonWorkScreenshots,
        distraction_score: distractionScore,
        activity_breakdown: activityBreakdown,
        category_breakdown: categoryBreakdown,
        privacy_risk_count: privacyRiskCount,
        max_consecutive_duplicates: consecutiveDuplicateMax,
        analysis_coverage: '24-hour coverage'
      },
      app_analysis: {
        top_apps: topApps,
        top_sites: topSites,
      },
      ai_generated: !!aiSummary,
      ai_insights: aiSummary,
    };

    // Guard: only insert insights if there is recent activity
    const { count: recentTimeLogsCount } = await supabase
      .from('time_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', employee.id)
      .gte('start_time', sinceTime);

    const hasRecentActivity = (recentTimeLogsCount || 0) > 0 || totalScreenshots > 0;

    if (!hasRecentActivity) {
      console.log('⏭️ Skipping insights insert: no recent activity for user', employee.id);
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: 'no_recent_activity',
          message: 'No recent activity found; insights not inserted.'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Save to ai_employee_insights table (with organization_id)
    const { error: saveError } = await supabase
      .from('ai_employee_insights')
      .insert({
        user_id: employee.id,
        organization_id: employee.organization_id || null,
        analysis_type: 'comprehensive',
        period_start: sinceTime,
        period_end: new Date().toISOString(),
        insights: {
          productivity_score: productivityScore,
          risk_level: riskLevel,
          risk_reasons: riskReasons,
          activity_percentage: totalScreenshots > 0 ? Math.round(activityPercentSum / totalScreenshots) : 0,
          total_hours: computedTotalHours,
          screenshots_analyzed: totalScreenshots,
          period_type: 'day',
          productivity_indicators: analysis.productivity_insights,
          distraction_indicators: {
            distraction_score: distractionScore,
            non_work_count: nonWorkScreenshots,
            non_work_percentage: Math.round(nonWorkPercentage),
            distracting_percentage: Math.round(distractingPercentage),
            common_distractions: Object.entries(categoryBreakdown)
              .filter(([cat]) => distractingCategories.includes(cat))
              .map(([cat, count]) => `${cat}: ${count}`)
          },
          behavioral_patterns: {
            work_style: aiSummary?.work_style || 'Standard analysis',
            top_apps: topApps.map(a => a.name).join(', '),
            time_management: aiSummary?.time_management || 'Normal patterns',
            consecutive_idle_max: consecutiveDuplicateMax,
            suspicious_activities: riskLevel !== 'low' ? riskReasons : []
          },
          screenshot_insights: analysis.screenshot_analysis,
          executive_summary: analysis.executive_summary,
          work_description: analysis.work_description,
          ai_suggestions: aiSummary?.suggestions || [],
          improvement_suggestions: aiSummary?.suggestions || generateDefaultSuggestions({
            distractionScore,
            consecutiveDuplicateMax,
            nonWorkScreenshots,
            totalScreenshots,
            productivityScore
          }),
          focus_areas: aiSummary?.focus_areas || getDefaultFocusAreas(topApps, categoryBreakdown),
        },
        confidence_score: totalScreenshots > 10 ? 0.9 : totalScreenshots > 0 ? 0.7 : 0.5,
        ai_model: aiSummary ? (useGemini ? GEMINI_MODEL : HF_TEXT_MODEL) : 'statistical-analysis',
        analysis_version: '3.1.0'
      });

    if (saveError) {
      console.error('Failed to save analysis:', saveError);
    }

    console.log('✅ Comprehensive analysis completed', {
      screenshots: totalScreenshots,
      productivityScore,
      aiGenerated: !!aiSummary,
    });

    return new Response(
      JSON.stringify({
        success: true,
        analysis,
        message: 'Comprehensive employee analysis completed successfully',
        ai_enhanced: !!aiSummary,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error: any) {
    console.error('Error in comprehensive employee analysis:', error);

    return new Response(
      JSON.stringify({
        error: 'Analysis failed',
        type: 'comprehensive_analysis_error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

/**
 * Generate AI-powered summary using Gemini (or HF fallback)
 */
async function generateAISummary(token: string, useGemini: boolean, data: {
  employeeName: string;
  totalScreenshots: number;
  productiveScreenshots: number;
  nonWorkScreenshots: number;
  productivityScore: number;
  distractionScore: number;
  topApps: Array<{ name: string; hours: number }>;
  topSites: Array<{ name: string; hours: number }>;
  activityBreakdown: Record<string, number>;
  categoryBreakdown: Record<string, number>;
  alertCount: number;
  consecutiveDuplicateMax: number;
  privacyRiskCount: number;
}): Promise<any> {
  // Calculate performance status for context
  const performanceStatus = data.productivityScore >= 80 ? 'excellent' :
    data.productivityScore >= 60 ? 'good' :
    data.productivityScore >= 40 ? 'needs improvement' : 'concerning';
  
  const nonWorkPercentage = data.totalScreenshots > 0 
    ? Math.round((data.nonWorkScreenshots / data.totalScreenshots) * 100) 
    : 0;

  const prompt = `You are an AI assistant generating productivity insights for a workplace time tracking system.
Analyze this employee's work data and generate a detailed, actionable summary.

EMPLOYEE DATA:
- Name: ${data.employeeName}
- Performance Status: ${performanceStatus.toUpperCase()}
- Productivity Score: ${data.productivityScore}%
- Total Screenshots: ${data.totalScreenshots}
- Productive vs Non-Work: ${data.productiveScreenshots} productive, ${data.nonWorkScreenshots} non-work (${nonWorkPercentage}% non-work)
- Distraction Score: ${data.distractionScore}%

APPLICATION USAGE:
${data.topApps.length > 0 ? data.topApps.map(a => `- ${a.name}: ${a.hours}h`).join('\n') : '- Various applications'}

WEBSITE USAGE:
${data.topSites.length > 0 ? data.topSites.map(s => `- ${s.name}: ${s.hours}h`).join('\n') : '- Various websites'}

ACTIVITY CATEGORIES:
${Object.entries(data.categoryBreakdown).map(([cat, count]) => `- ${cat}: ${count} screenshots`).join('\n')}

CONCERNS:
- Active Alerts: ${data.alertCount}
- Max Consecutive Idle Screenshots: ${data.consecutiveDuplicateMax} ${data.consecutiveDuplicateMax > 15 ? '(HIGH)' : data.consecutiveDuplicateMax > 10 ? '(MODERATE)' : '(NORMAL)'}
- Privacy Risk Incidents: ${data.privacyRiskCount}

Generate a JSON response with specific, actionable insights:
{
  "executive_summary": "2-3 sentences describing overall performance, main activities, and key observations. Be specific about what they worked on.",
  "work_description": "Describe what they're actually doing based on apps/sites (e.g., 'Developing code in VS Code and reviewing designs in Figma' NOT 'Working with various applications')",
  "work_style": "Characterize their work pattern (e.g., 'Focused developer with minimal distractions' or 'Frequently switching between tasks with notable idle periods')",
  "time_management": "Specific assessment (e.g., 'Good focus blocks but ${data.consecutiveDuplicateMax > 15 ? 'extended idle periods need attention' : 'healthy break patterns'}')",
  "peak_hours": ["Morning 9-11 AM", "Afternoon 2-4 PM"],
  "focus_areas": ["Main work category 1", "Main work category 2"],
  "suggestions": [
    ${data.productivityScore < 60 ? '"Specific improvement suggestion based on their weak areas",' : ''}
    ${data.distractionScore > 40 ? '"Suggestion to reduce specific distractions found",' : ''}
    ${data.consecutiveDuplicateMax > 15 ? '"Suggestion about idle time management",' : ''}
    "Actionable recommendation based on their data"
  ]
}

Be SPECIFIC - mention actual app names and observed patterns. Avoid generic phrases.
Respond with ONLY valid JSON.`;

  try {
    let response: Response;
    let text: string | undefined;

    if (useGemini) {
      response = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GEMINI_MODEL,
          messages: [
            { role: 'system', content: 'You are a helpful AI assistant that generates professional productivity insights.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 500,
          temperature: 0.7,
        }),
      });
      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }
      const result = await response.json();
      text = result.choices?.[0]?.message?.content;
    } else {
      response = await fetch(`${HF_API_BASE}/${HF_TEXT_MODEL}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: `<|system|>\nYou are a helpful AI assistant that generates professional productivity insights.<|endoftext|>\n<|user|>\n${prompt}<|endoftext|>\n<|assistant|>\n`,
          parameters: {
            max_new_tokens: 500,
            temperature: 0.7,
            return_full_text: false,
          }
        }),
      });
      if (!response.ok) {
        throw new Error(`HF API error: ${response.status}`);
      }
      const result = await response.json();
      text = Array.isArray(result) ? result[0]?.generated_text : result.generated_text;
    }

    // Parse JSON from response
    const jsonMatch = text?.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // Fallback: generate detailed summary based on metrics
    const mainApp = data.topApps[0]?.name || 'various applications';
    const secondApp = data.topApps[1]?.name;
    const mainSite = data.topSites[0]?.name;
    
    // Determine performance description
    let performanceDesc = '';
    if (data.productivityScore >= 80) {
      performanceDesc = 'demonstrates excellent productivity and focus';
    } else if (data.productivityScore >= 60) {
      performanceDesc = 'shows good productivity with room for improvement';
    } else if (data.productivityScore >= 40) {
      performanceDesc = 'has below-average productivity that needs attention';
    } else {
      performanceDesc = 'shows concerning productivity levels requiring immediate intervention';
    }

    // Build work description
    let workDesc = `Working primarily with ${mainApp}`;
    if (secondApp) {
      workDesc += ` and ${secondApp}`;
    }
    if (mainSite) {
      workDesc += `, browsing ${mainSite}`;
    }

    // Time management assessment
    let timeManagement = 'Good time utilization with healthy break patterns';
    if (data.consecutiveDuplicateMax > 30) {
      timeManagement = 'Extended idle periods detected - may indicate engagement issues';
    } else if (data.consecutiveDuplicateMax > 15) {
      timeManagement = 'Notable idle periods - consider shorter, more frequent breaks';
    } else if (data.distractionScore > 50) {
      timeManagement = 'Frequent context switching between work and non-work activities';
    }

    return {
      executive_summary: `${data.employeeName} ${performanceDesc} with ${data.productivityScore}% productivity across ${data.totalScreenshots} analyzed screenshots. Primary focus was on ${mainApp}${data.distractionScore > 40 ? `, though distraction levels (${data.distractionScore}%) could be reduced` : ''}.`,
      work_description: workDesc,
      work_style: data.productivityScore >= 80 ? 'Highly focused with consistent output' : 
        data.productivityScore >= 60 ? 'Moderately focused with some interruptions' : 
        data.distractionScore > 50 ? 'Easily distracted with frequent non-work activity' :
        'Inconsistent focus requiring performance support',
      time_management: timeManagement,
      peak_hours: ['9:00 AM - 11:00 AM', '2:00 PM - 4:00 PM'],
      focus_areas: getDefaultFocusAreas(data.topApps, data.categoryBreakdown),
      suggestions: generateDefaultSuggestions(data),
    };
  } catch (error) {
    console.error('AI summary generation error:', error);
    throw error;
  }
}

/**
 * Generate default suggestions based on metrics
 */
function generateDefaultSuggestions(data: any): string[] {
  const suggestions: string[] = [];

  if (data.productivityScore < 40) {
    suggestions.push('Immediate attention required: productivity is critically low');
    suggestions.push('Schedule a performance review meeting');
  } else if (data.productivityScore < 60) {
    suggestions.push('Set clear daily goals and track progress throughout the day');
    suggestions.push('Use focus techniques like Pomodoro to increase productive time');
  }

  if (data.distractionScore > 60) {
    suggestions.push('Reduce access to distracting websites and applications');
    suggestions.push('Consider using website blockers during work hours');
  } else if (data.distractionScore > 40) {
    suggestions.push('Schedule specific break times for personal activities');
  }

  if (data.consecutiveDuplicateMax > 30) {
    suggestions.push('Address extended idle periods - may indicate engagement issues');
  } else if (data.consecutiveDuplicateMax > 15) {
    suggestions.push('Take regular short breaks instead of long idle periods');
  }

  if (data.nonWorkScreenshots > data.totalScreenshots * 0.4) {
    suggestions.push('Significantly reduce non-work activities during tracked time');
  } else if (data.nonWorkScreenshots > data.totalScreenshots * 0.2) {
    suggestions.push('Better balance between work and personal activities needed');
  }

  if (data.productivityScore >= 80) {
    suggestions.push('Excellent performance - maintain current work habits');
    suggestions.push('Consider mentoring team members with similar roles');
  }

  // Ensure we have at least one suggestion
  if (suggestions.length === 0) {
    suggestions.push('Continue maintaining good productivity levels');
  }

  return suggestions.slice(0, 4);
}

/**
 * Get default focus areas based on app usage and categories
 */
function getDefaultFocusAreas(
  topApps: Array<{ name: string; hours: number }>,
  categoryBreakdown: Record<string, number>
): string[] {
  const areas: string[] = [];

  // Add top apps as focus areas
  topApps.slice(0, 2).forEach(app => {
    if (app.name && app.name !== 'Unknown') {
      areas.push(app.name);
    }
  });

  // Add work categories
  if (categoryBreakdown['productive'] > 0) {
    areas.push('Productive work');
  }
  if (categoryBreakdown['development'] > 0 || categoryBreakdown['coding'] > 0) {
    areas.push('Software development');
  }
  if (categoryBreakdown['communication'] > 0) {
    areas.push('Communication');
  }
  if (categoryBreakdown['design'] > 0) {
    areas.push('Design work');
  }

  return areas.slice(0, 4);
}

/**
 * Build a descriptive fallback executive summary using actual data
 */
function buildFallbackSummary(
  name: string,
  topApps: Array<{ name: string; hours: number }>,
  topSites: Array<{ name: string; hours: number }>,
  productivityScore: number,
  distractionScore: number,
  totalScreenshots: number,
  totalHours: number,
): string {
  const appNames = topApps.slice(0, 3).map(a => a.name);
  const siteNames = topSites.slice(0, 2).map(s => s.name);

  let appPart = '';
  if (appNames.length >= 2) {
    appPart = `primarily used ${appNames.slice(0, -1).join(', ')} and ${appNames[appNames.length - 1]}`;
  } else if (appNames.length === 1) {
    appPart = `primarily used ${appNames[0]}`;
  } else {
    appPart = 'worked with various applications';
  }

  let sitePart = '';
  if (siteNames.length > 0) {
    sitePart = `, visiting ${siteNames.join(' and ')}`;
  }

  let perfPart = '';
  if (productivityScore >= 90) {
    perfPart = 'Highly focused and productive session';
  } else if (productivityScore >= 70) {
    perfPart = 'Good productivity with consistent focus';
  } else if (productivityScore >= 50) {
    perfPart = 'Moderate productivity with room for improvement';
  } else {
    perfPart = 'Below-average productivity requiring attention';
  }

  if (distractionScore > 40) {
    perfPart += ` (distraction level: ${distractionScore}%)`;
  }

  const hoursPart = totalHours > 0 ? ` over ${totalHours} hours` : '';

  return `${name} ${appPart}${sitePart}${hoursPart}. ${perfPart}. ${totalScreenshots} screenshots analyzed.`;
}

/**
 * Build a descriptive work_description from app and site data
 */
function buildFallbackWorkDescription(
  topApps: Array<{ name: string; hours: number }>,
  topSites: Array<{ name: string; hours: number }>,
): string {
  const parts: string[] = [];

  if (topApps.length > 0) {
    const appNames = topApps.slice(0, 3).map(a => a.name);
    parts.push(`Working with ${appNames.join(', ')}`);
  }
  if (topSites.length > 0) {
    const siteNames = topSites.slice(0, 2).map(s => s.name);
    parts.push(`browsing ${siteNames.join(', ')}`);
  }

  if (parts.length === 0) return 'Working with various applications';
  return parts.join('; ');
}

console.log('🤖 Comprehensive Employee Analysis v3.2 with improved summaries and hours calculation initialized');
