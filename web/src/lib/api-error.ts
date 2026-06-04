export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Avoid retry storms on auth/rate-limit failures (React Query default retry: 3). */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    if ([401, 403, 404, 429].includes(error.status)) {
      return false;
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/429|too many requests/i.test(message)) {
    return false;
  }
  return failureCount < 2;
}
