-- Migration: Detect repetitive content duplicates (including high-activity duplicates)
-- Date: 2026-01-23
-- Description: Expands duplicate detection to include repetitive content with high activity,
--              not just idle/frozen screens. Detects same screen repeatedly within 15min.

-- Mark duplicates including high-activity ones (repetitive content)
-- Previous logic only marked duplicates with 0% activity (idle screens)
-- New logic marks BOTH:
--   1. Idle duplicates: 0-30% activity = frozen/idle screen
--   2. Repetitive content: >30% activity = same screen repeatedly (user is working but not progressing)

WITH true_duplicates AS (
    SELECT DISTINCT ON (s2.id)
        s2.id as duplicate_id,
        s1.id as original_id,
        s2.user_id,
        s2.perceptual_hash,
        s2.activity_percent
    FROM screenshots s1
    JOIN screenshots s2 ON (
        s1.user_id = s2.user_id
        AND s1.perceptual_hash = s2.perceptual_hash
        AND s1.window_title = s2.window_title
        AND s1.captured_at < s2.captured_at
        AND s2.captured_at - s1.captured_at < INTERVAL '15 minutes'  -- Increased from 5min to catch repetitive patterns
        AND s1.id != s2.id
    )
    WHERE s1.perceptual_hash IS NOT NULL
    ORDER BY s2.id, s1.captured_at DESC
)
UPDATE screenshots s
SET 
    is_duplicate = true,
    duplicate_reason = CASE 
        WHEN td.activity_percent <= 30 THEN 'Idle duplicate: identical content + low activity'
        ELSE 'Repetitive content: same screen repeatedly (<15min apart)'
    END,
    duplicate_matched_id = td.original_id,
    duplicate_group_hash = MD5(td.user_id::text || td.perceptual_hash || DATE(s.captured_at)::text)
FROM true_duplicates td
WHERE s.id = td.duplicate_id;

-- Add comment explaining the duplicate detection logic
COMMENT ON COLUMN screenshots.is_duplicate IS 
    'Duplicate detection (Jan 2026): 
     - Idle duplicates: same hash + same window + <15min apart + <=30% activity (frozen screen)
     - Repetitive content: same hash + same window + <15min apart + >30% activity (user working but not progressing)
     Uses perceptual hash with Hamming distance thresholds: EXACT=0, NEAR=2, SIMILAR=3';
