/**
 * Paginate through Supabase queries that exceed the default 1000-row PostgREST limit.
 *
 * Use this for any query against high-volume tables (screenshots, app_logs, url_logs, idle_logs)
 * where the result set may exceed 1 000 rows.
 *
 * @param queryBuilder - A Supabase query builder (do NOT call .limit() or .range() on it first)
 * @param pageSize     - Rows fetched per round-trip (default 1 000)
 * @param maxRows      - Safety cap to prevent runaway fetches (default 50 000)
 */
export async function fetchPaginated<T = any>(
  queryBuilder: any,
  pageSize = 1000,
  maxRows = 50_000
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  while (offset < maxRows) {
    const { data, error } = await queryBuilder.range(offset, offset + pageSize - 1);
    if (error) { console.warn('[fetchPaginated] query error:', error); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

/** Default row limit for single-page queries on high-volume tables. */
export const HIGH_VOLUME_LIMIT = 10_000;
