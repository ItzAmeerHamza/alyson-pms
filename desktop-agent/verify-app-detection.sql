-- App Detection Verification Queries
-- Run these in your Supabase SQL editor after testing

-- 1. Recent app logs (last 10 minutes)
SELECT 
  app_name,
  window_title,
  capture_method,
  timestamp,
  EXTRACT(EPOCH FROM (NOW() - timestamp::timestamptz)) as seconds_ago
FROM app_logs 
WHERE timestamp > NOW() - INTERVAL '10 minutes'
ORDER BY timestamp DESC;

-- 2. App switching frequency
SELECT 
  app_name,
  COUNT(*) as detection_count,
  MIN(timestamp) as first_seen,
  MAX(timestamp) as last_seen,
  COUNT(DISTINCT window_title) as unique_titles
FROM app_logs 
WHERE timestamp > NOW() - INTERVAL '10 minutes'
GROUP BY app_name
ORDER BY detection_count DESC;

-- 3. Real-time vs periodic capture breakdown
SELECT 
  capture_method,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM app_logs 
WHERE timestamp > NOW() - INTERVAL '10 minutes'
GROUP BY capture_method;

-- 4. Window title changes within same app
SELECT 
  app_name,
  window_title,
  COUNT(*) as occurrences,
  timestamp
FROM app_logs 
WHERE timestamp > NOW() - INTERVAL '10 minutes'
  AND app_name IN (
    SELECT app_name 
    FROM app_logs 
    WHERE timestamp > NOW() - INTERVAL '10 minutes'
    GROUP BY app_name 
    HAVING COUNT(DISTINCT window_title) > 1
  )
ORDER BY app_name, timestamp;

-- 5. Detection gaps (should be minimal)
WITH time_gaps AS (
  SELECT 
    app_name,
    timestamp,
    LAG(timestamp) OVER (ORDER BY timestamp) as prev_timestamp,
    EXTRACT(EPOCH FROM (timestamp::timestamptz - LAG(timestamp::timestamptz) OVER (ORDER BY timestamp))) as gap_seconds
  FROM app_logs 
  WHERE timestamp > NOW() - INTERVAL '10 minutes'
)
SELECT 
  app_name,
  timestamp,
  gap_seconds,
  CASE 
    WHEN gap_seconds > 30 THEN '🔴 Large gap'
    WHEN gap_seconds > 15 THEN '🟡 Medium gap'
    ELSE '🟢 Good'
  END as gap_status
FROM time_gaps 
WHERE gap_seconds IS NOT NULL
ORDER BY gap_seconds DESC;

-- 6. Check for missing data issues
SELECT 
  'Total app logs' as metric,
  COUNT(*) as value
FROM app_logs 
WHERE timestamp > NOW() - INTERVAL '10 minutes'

UNION ALL

SELECT 
  'Apps with missing titles' as metric,
  COUNT(*) as value
FROM app_logs 
WHERE timestamp > NOW() - INTERVAL '10 minutes'
  AND (window_title IS NULL OR window_title = '' OR window_title = 'Unknown')

UNION ALL

SELECT 
  'Duplicate entries (< 5s apart)' as metric,
  COUNT(*) as value
FROM (
  SELECT 
    app_name,
    window_title,
    timestamp,
    LAG(timestamp) OVER (PARTITION BY app_name ORDER BY timestamp) as prev_timestamp
  FROM app_logs 
  WHERE timestamp > NOW() - INTERVAL '10 minutes'
) duplicates
WHERE EXTRACT(EPOCH FROM (timestamp::timestamptz - prev_timestamp::timestamptz)) < 5;
