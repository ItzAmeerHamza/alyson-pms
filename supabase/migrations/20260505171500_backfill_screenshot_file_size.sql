-- Backfill screenshots.file_size from storage metadata for historical rows.
-- Cost dashboards depend on this value for storage byte totals.

UPDATE public.screenshots s
SET file_size = src.size_bytes::integer
FROM (
  SELECT
    o.name AS file_path,
    COALESCE(
      CASE WHEN COALESCE(o.metadata->>'size', '') ~ '^[0-9]+$' THEN (o.metadata->>'size')::bigint END,
      CASE WHEN COALESCE(o.metadata->>'fileSize', '') ~ '^[0-9]+$' THEN (o.metadata->>'fileSize')::bigint END
    ) AS size_bytes
  FROM storage.objects o
  WHERE o.bucket_id = 'screenshots'
) src
WHERE s.file_path = src.file_path
  AND COALESCE(s.file_size, 0) = 0
  AND src.size_bytes IS NOT NULL
  AND src.size_bytes >= 0
  AND src.size_bytes <= 2147483647;
