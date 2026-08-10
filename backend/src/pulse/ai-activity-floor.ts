/**
 * Screenshot-content signal for the low-activity calculation. Keyboard/mouse-based
 * activity_percent systematically under-counts roles that read, research, or take
 * calls without heavy typing/clicking (e.g. affiliates) — mirrors the meeting floor
 * in meeting-context.ts, but keyed off the AI vision analysis already computed per
 * screenshot instead of app/window-title pattern matching.
 *
 * confidence_score is capped at 50 by the analysis prompt for neutral/unclear
 * screenshots, so requiring > 50 excludes that default band and only trusts
 * genuinely confident "this is real work" calls.
 */
export const SCREENSHOT_IS_AI_CONFIRMED_PRODUCTIVE_SQL = `(
  s.ai_analysis_status = 'completed'
  AND s.is_work_related = TRUE
  AND COALESCE(s.confidence_score, 0) > 50
)`;
