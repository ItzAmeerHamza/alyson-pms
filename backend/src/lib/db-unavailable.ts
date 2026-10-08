/** RDS / pool blips that must become 503, not a 500 retry storm. */

const DB_UNAVAILABLE_RE =
  /too many connections|remaining connection slots|connection terminated|ECONNRESET|connect ETIMEDOUT|timeout expired|the database system is|remaining connection|53300|57P03|08006|08001|08000|53301/i;

const DB_UNAVAILABLE_CODES = new Set([
  '53300',
  '53301',
  '57P03',
  '08000',
  '08001',
  '08003',
  '08006',
]);

export function isDbUnavailableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return DB_UNAVAILABLE_RE.test(String(err || ''));
  }
  const rec = err as { message?: string; code?: string; cause?: unknown };
  if (rec.code && DB_UNAVAILABLE_CODES.has(String(rec.code))) return true;
  if (DB_UNAVAILABLE_RE.test(String(rec.message || ''))) return true;
  if (rec.cause) return isDbUnavailableError(rec.cause);
  return false;
}
