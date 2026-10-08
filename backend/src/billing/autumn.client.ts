export const AUTUMN_API_VERSION = '2.4.0';
export const AUTUMN_API_BASE = 'https://api.useautumn.com';

const ALLOWED_PATHS = new Set([
  '/v1/customers.get_or_create',
  '/v1/balances.check',
  '/v1/billing.attach',
  '/v1/billing.open_customer_portal',
]);

export class AutumnRequestError extends Error {
  constructor(readonly status: number) {
    super('Autumn request failed');
  }
}

export async function autumnPost(
  secret: string,
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!ALLOWED_PATHS.has(path)) {
    throw new AutumnRequestError(400);
  }
  const response = await fetch(`${AUTUMN_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      'x-api-version': AUTUMN_API_VERSION,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok || !json || typeof json !== 'object' || Array.isArray(json)) {
    throw new AutumnRequestError(response.status);
  }
  return json as Record<string, unknown>;
}
