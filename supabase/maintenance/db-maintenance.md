# Database Maintenance for URL Tracking v2

This document outlines recommended maintenance procedures for optimal performance of the `app_url_activity` table and its indexes.

## Weekly Maintenance Tasks

### Autovacuum and Statistics Update
```sql
-- Run weekly to maintain index health and query optimization
VACUUM (ANALYZE) app_url_activity;

-- Optional: More aggressive vacuum if needed
-- VACUUM (FULL, ANALYZE) app_url_activity; -- Use during low-traffic periods
```

### BRIN Index Maintenance
```sql
-- Check BRIN index effectiveness
SELECT 
  schemaname, 
  tablename, 
  indexname, 
  idx_scan, 
  idx_tup_read, 
  idx_tup_fetch
FROM pg_stat_user_indexes 
WHERE tablename = 'app_url_activity' 
  AND indexname LIKE '%brin%';

-- Reindex BRIN monthly or if effectiveness drops
REINDEX INDEX idx_app_url_activity_started_at_brin;
```

## Monthly Maintenance Tasks

### Index Health Check
```sql
-- Check index bloat and usage statistics
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes 
WHERE tablename = 'app_url_activity'
ORDER BY pg_relation_size(indexrelid) DESC;
```

### Table Size and Growth Monitoring
```sql
-- Monitor table growth trends
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
  pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as indexes_size
FROM pg_tables 
WHERE tablename = 'app_url_activity';
```

## Performance Optimization

### Hot Partition Detection
```sql
-- Identify time-based hot partitions for BRIN effectiveness
SELECT 
  date_trunc('hour', started_at) as hour_bucket,
  count(*) as events_count,
  min(started_at) as min_time,
  max(started_at) as max_time
FROM app_url_activity 
WHERE started_at >= now() - interval '24 hours'
GROUP BY hour_bucket 
ORDER BY events_count DESC
LIMIT 10;
```

### Query Performance Analysis
```sql
-- Check slow queries affecting URL tracking
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  rows
FROM pg_stat_statements 
WHERE query LIKE '%app_url_activity%' 
  OR query LIKE '%url_logs%'
ORDER BY mean_time DESC
LIMIT 10;
```

## Automated Maintenance Script

```sql
-- Create maintenance function for easy scheduling
CREATE OR REPLACE FUNCTION maintain_url_tracking()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Vacuum and analyze main table
  EXECUTE 'VACUUM (ANALYZE) app_url_activity';
  
  -- Update table statistics
  EXECUTE 'ANALYZE app_url_activity';
  
  -- Reindex BRIN if older than 30 days
  EXECUTE 'REINDEX INDEX CONCURRENTLY idx_app_url_activity_started_at_brin';
  
  -- Log completion
  RAISE NOTICE 'URL tracking maintenance completed at %', now();
END;
$$;

-- Schedule via cron or edge function
-- Example: SELECT maintain_url_tracking();
```

## Retention Management

### Automatic Data Retention
```sql
-- Use existing retention function
SELECT prune_old_url_activity(180); -- Keep 180 days

-- Check retention effectiveness
SELECT 
  date_trunc('month', started_at) as month,
  count(*) as records
FROM app_url_activity 
GROUP BY month 
ORDER BY month DESC
LIMIT 12;
```

## Monitoring Alerts

### Key Metrics to Monitor
- **Table size growth rate**: Should be consistent with user activity
- **Index effectiveness**: BRIN should have reasonable scan rates
- **Query performance**: Mean execution time for URL inserts/selects
- **Vacuum frequency**: Autovacuum should run regularly

### Warning Thresholds
- Table size growing >50% month-over-month unexpectedly
- BRIN index effectiveness dropping below expected range
- Query mean time increasing >2x normal baseline
- Vacuum not running for >7 days

## Troubleshooting

### High Table Size
1. Check retention policy is working: `SELECT prune_old_url_activity(180);`
2. Verify data patterns for unexpected growth
3. Consider VACUUM FULL during low-traffic period

### Slow Query Performance  
1. Check if BRIN index needs reindexing
2. Analyze query patterns for optimization opportunities
3. Verify statistics are up-to-date with ANALYZE

### Index Bloat
1. REINDEX CONCURRENTLY during low traffic
2. Check autovacuum configuration
3. Consider adjusting vacuum thresholds

This maintenance ensures optimal performance of the URL tracking system while preserving all data and functionality.
