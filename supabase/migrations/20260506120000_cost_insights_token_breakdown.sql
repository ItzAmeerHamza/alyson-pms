-- Extend get_organization_cost_insights: text vs vision token splits, per-model token sums, averages.

CREATE OR REPLACE FUNCTION public.get_organization_cost_insights(p_organization_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH caller AS (
  SELECT
    u.role::text AS role,
    u.organization_id AS org_id,
    COALESCE(u.is_org_admin, false) AS is_org_admin,
    COALESCE(u.is_super_admin, false) AS is_super_admin
  FROM public.users u
  WHERE u.id = auth.uid()
),
allowed AS (
  SELECT EXISTS (
    SELECT 1
    FROM caller c
    WHERE c.is_super_admin
       OR (
            (c.role = 'admin' OR c.is_org_admin)
            AND c.org_id IS NOT NULL
            AND c.org_id = p_organization_id
          )
  ) AS ok
),
scoped AS (
  SELECT
    s.user_id,
    s.file_size,
    s.ai_metadata,
    s.ai_model_used,
    s.ai_analysis_status,
    u.full_name AS user_full_name,
    u.email AS user_email
  FROM public.screenshots s
  INNER JOIN public.users u ON u.id = s.user_id
  CROSS JOIN allowed a
  WHERE a.ok
    AND u.organization_id = p_organization_id
)
SELECT CASE
  WHEN auth.uid() IS NULL THEN jsonb_build_object('error', 'not_authenticated')
  WHEN NOT (SELECT ok FROM allowed) THEN jsonb_build_object('error', 'forbidden')
  ELSE jsonb_build_object(
    'organization_id', p_organization_id::text,
    'storage_totals', (
      SELECT jsonb_build_object(
        'bytes', COALESCE(SUM(COALESCE(file_size, 0)), 0)::bigint,
        'screenshot_count', COUNT(*)::bigint
      )
      FROM scoped
    ),
    'storage_by_user', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'user_id', t.user_id::text,
            'full_name', t.user_full_name,
            'email', t.user_email,
            'bytes', t.bytes,
            'screenshot_count', t.cnt,
            'avg_bytes_per_shot',
              CASE WHEN t.cnt > 0 THEN ROUND(t.bytes::numeric / t.cnt::numeric)::bigint ELSE 0::bigint END
          )
          ORDER BY t.bytes DESC
        )
        FROM (
          SELECT
            user_id,
            MAX(user_full_name) AS user_full_name,
            MAX(user_email) AS user_email,
            SUM(COALESCE(file_size, 0))::bigint AS bytes,
            COUNT(*)::bigint AS cnt
          FROM scoped
          GROUP BY user_id
        ) t
      ),
      '[]'::jsonb
    ),
    'llm_totals', (
      SELECT jsonb_build_object(
        'completed_analyses', COUNT(*) FILTER (WHERE ai_analysis_status = 'completed')::bigint,
        'non_pattern_model_rows', COUNT(*) FILTER (
          WHERE ai_model_used IS NOT NULL AND ai_model_used <> 'pattern-based'
        )::bigint,
        'rows_with_token_usage', COUNT(*) FILTER (
          WHERE ai_metadata ? 'deepseek_usage'
            AND NULLIF(btrim(ai_metadata->'deepseek_usage'->>'total_tokens'), '') IS NOT NULL
        )::bigint,
        'total_deepseek_tokens', COALESCE(
          SUM(
            CASE
              WHEN ai_metadata ? 'deepseek_usage'
                AND NULLIF(btrim(ai_metadata->'deepseek_usage'->>'total_tokens'), '') IS NOT NULL
              THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->>'total_tokens'), ''))::bigint
              ELSE 0::bigint
            END
          ),
          0::bigint
        ),
        'total_prompt_tokens', COALESCE(
          SUM(
            COALESCE(
              CASE
                WHEN ai_metadata ? 'deepseek_usage'
                  AND (ai_metadata->'deepseek_usage') ? 'text'
                  AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'prompt_tokens'), '') IS NOT NULL
                THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'prompt_tokens'), ''))::bigint
                ELSE 0::bigint
              END,
              0::bigint
            )
            +
            COALESCE(
              CASE
                WHEN ai_metadata ? 'deepseek_usage'
                  AND (ai_metadata->'deepseek_usage') ? 'vision'
                  AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'prompt_tokens'), '') IS NOT NULL
                THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'prompt_tokens'), ''))::bigint
                ELSE 0::bigint
              END,
              0::bigint
            )
          ),
          0::bigint
        ),
        'total_completion_tokens', COALESCE(
          SUM(
            COALESCE(
              CASE
                WHEN ai_metadata ? 'deepseek_usage'
                  AND (ai_metadata->'deepseek_usage') ? 'text'
                  AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'completion_tokens'), '') IS NOT NULL
                THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'completion_tokens'), ''))::bigint
                ELSE 0::bigint
              END,
              0::bigint
            )
            +
            COALESCE(
              CASE
                WHEN ai_metadata ? 'deepseek_usage'
                  AND (ai_metadata->'deepseek_usage') ? 'vision'
                  AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'completion_tokens'), '') IS NOT NULL
                THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'completion_tokens'), ''))::bigint
                ELSE 0::bigint
              END,
              0::bigint
            )
          ),
          0::bigint
        ),
        'text_prompt_tokens', COALESCE(
          SUM(
            CASE
              WHEN ai_metadata ? 'deepseek_usage'
                AND (ai_metadata->'deepseek_usage') ? 'text'
                AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'prompt_tokens'), '') IS NOT NULL
              THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'prompt_tokens'), ''))::bigint
              ELSE 0::bigint
            END
          ),
          0::bigint
        ),
        'text_completion_tokens', COALESCE(
          SUM(
            CASE
              WHEN ai_metadata ? 'deepseek_usage'
                AND (ai_metadata->'deepseek_usage') ? 'text'
                AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'completion_tokens'), '') IS NOT NULL
              THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'completion_tokens'), ''))::bigint
              ELSE 0::bigint
            END
          ),
          0::bigint
        ),
        'text_total_tokens', COALESCE(
          SUM(
            CASE
              WHEN ai_metadata ? 'deepseek_usage'
                AND (ai_metadata->'deepseek_usage') ? 'text'
                AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'total_tokens'), '') IS NOT NULL
              THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'total_tokens'), ''))::bigint
              ELSE 0::bigint
            END
          ),
          0::bigint
        ),
        'vision_prompt_tokens', COALESCE(
          SUM(
            CASE
              WHEN ai_metadata ? 'deepseek_usage'
                AND (ai_metadata->'deepseek_usage') ? 'vision'
                AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'prompt_tokens'), '') IS NOT NULL
              THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'prompt_tokens'), ''))::bigint
              ELSE 0::bigint
            END
          ),
          0::bigint
        ),
        'vision_completion_tokens', COALESCE(
          SUM(
            CASE
              WHEN ai_metadata ? 'deepseek_usage'
                AND (ai_metadata->'deepseek_usage') ? 'vision'
                AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'completion_tokens'), '') IS NOT NULL
              THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'completion_tokens'), ''))::bigint
              ELSE 0::bigint
            END
          ),
          0::bigint
        ),
        'vision_total_tokens', COALESCE(
          SUM(
            CASE
              WHEN ai_metadata ? 'deepseek_usage'
                AND (ai_metadata->'deepseek_usage') ? 'vision'
                AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'total_tokens'), '') IS NOT NULL
              THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'total_tokens'), ''))::bigint
              ELSE 0::bigint
            END
          ),
          0::bigint
        ),
        'avg_total_tokens_per_logged_row', (
          SELECT CASE
            WHEN cnt = 0 THEN 0::bigint
            ELSE ROUND(tsum::numeric / cnt::numeric)::bigint
          END
          FROM (
            SELECT
              COUNT(*) FILTER (
                WHERE ai_metadata ? 'deepseek_usage'
                  AND NULLIF(btrim(ai_metadata->'deepseek_usage'->>'total_tokens'), '') IS NOT NULL
              )::bigint AS cnt,
              COALESCE(
                SUM(
                  CASE
                    WHEN ai_metadata ? 'deepseek_usage'
                      AND NULLIF(btrim(ai_metadata->'deepseek_usage'->>'total_tokens'), '') IS NOT NULL
                    THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->>'total_tokens'), ''))::bigint
                    ELSE 0::bigint
                  END
                ),
                0::bigint
              ) AS tsum
            FROM scoped
          ) z
        )
      )
      FROM scoped
    ),
    'llm_by_model', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'ai_model_used', m.ai_model_used,
            'count', m.cnt
          )
          ORDER BY m.cnt DESC
        )
        FROM (
          SELECT ai_model_used, COUNT(*)::bigint AS cnt
          FROM scoped
          WHERE ai_model_used IS NOT NULL
            AND ai_model_used <> 'pattern-based'
          GROUP BY ai_model_used
        ) m
      ),
      '[]'::jsonb
    ),
    'llm_tokens_by_model', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'model', t.ai_model_used,
            'analysis_rows', t.analysis_rows,
            'rows_with_token_log', t.rows_with_token_log,
            'total_tokens', t.total_tokens,
            'prompt_tokens', t.prompt_tokens,
            'completion_tokens', t.completion_tokens
          )
          ORDER BY t.total_tokens DESC
        )
        FROM (
          SELECT
            ai_model_used,
            COUNT(*)::bigint AS analysis_rows,
            COUNT(*) FILTER (
              WHERE ai_metadata ? 'deepseek_usage'
                AND NULLIF(btrim(ai_metadata->'deepseek_usage'->>'total_tokens'), '') IS NOT NULL
            )::bigint AS rows_with_token_log,
            COALESCE(
              SUM(
                CASE
                  WHEN ai_metadata ? 'deepseek_usage'
                    AND NULLIF(btrim(ai_metadata->'deepseek_usage'->>'total_tokens'), '') IS NOT NULL
                  THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->>'total_tokens'), ''))::bigint
                  ELSE 0::bigint
                END
              ),
              0::bigint
            ) AS total_tokens,
            COALESCE(
              SUM(
                COALESCE(
                  CASE
                    WHEN ai_metadata ? 'deepseek_usage'
                      AND (ai_metadata->'deepseek_usage') ? 'text'
                      AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'prompt_tokens'), '') IS NOT NULL
                    THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'prompt_tokens'), ''))::bigint
                    ELSE 0::bigint
                  END,
                  0::bigint
                )
                +
                COALESCE(
                  CASE
                    WHEN ai_metadata ? 'deepseek_usage'
                      AND (ai_metadata->'deepseek_usage') ? 'vision'
                      AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'prompt_tokens'), '') IS NOT NULL
                    THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'prompt_tokens'), ''))::bigint
                    ELSE 0::bigint
                  END,
                  0::bigint
                )
              ),
              0::bigint
            ) AS prompt_tokens,
            COALESCE(
              SUM(
                COALESCE(
                  CASE
                    WHEN ai_metadata ? 'deepseek_usage'
                      AND (ai_metadata->'deepseek_usage') ? 'text'
                      AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'completion_tokens'), '') IS NOT NULL
                    THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'completion_tokens'), ''))::bigint
                    ELSE 0::bigint
                  END,
                  0::bigint
                )
                +
                COALESCE(
                  CASE
                    WHEN ai_metadata ? 'deepseek_usage'
                      AND (ai_metadata->'deepseek_usage') ? 'vision'
                      AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'completion_tokens'), '') IS NOT NULL
                    THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'completion_tokens'), ''))::bigint
                    ELSE 0::bigint
                  END,
                  0::bigint
                )
              ),
              0::bigint
            ) AS completion_tokens
          FROM scoped
          WHERE ai_model_used IS NOT NULL
            AND ai_model_used <> 'pattern-based'
          GROUP BY ai_model_used
        ) t
      ),
      '[]'::jsonb
    )
  )
END;
$$;

ALTER FUNCTION public.get_organization_cost_insights(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.get_organization_cost_insights(uuid) IS
  'Org-scoped screenshot bytes + DeepSeek token aggregates (incl. text/vision split, per-model tokens).';

GRANT EXECUTE ON FUNCTION public.get_organization_cost_insights(uuid) TO authenticated;
