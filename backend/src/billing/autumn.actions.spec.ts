import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAutumnAction } from './autumn.actions';

describe('runAutumnAction', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('creates the workspace customer and checks each feature', async () => {
    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { feature_id?: string };
      return {
        ok: true,
        text: async () => JSON.stringify(
          body.feature_id
            ? { allowed: body.feature_id !== 'leave', balance: { remaining: body.feature_id === 'seats' ? 4 : 0 } }
            : { customer_id: 'workspace_10' },
        ),
      };
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await runAutumnAction('am_sk_test', {
      action: 'entitlements',
      workspaceId: '10',
      name: 'Acme',
    });

    expect(result.customerId).toBe('workspace_10');
    expect(result.features).toMatchObject({ team_reports: true, leave: false, seats: true });
    expect(result.seatsRemaining).toBe(4);
    const first = fetchMock.mock.calls[0];
    expect(String(first[0])).toContain('/v1/customers.get_or_create');
    expect(JSON.parse((first[1] as { body: string }).body).customer_id).toBe('workspace_10');
  });

  it('returns a checkout url for attach', async () => {
    globalThis.fetch = vi.fn(async (url: string) => ({
      ok: true,
      text: async () => JSON.stringify(
        String(url).includes('billing.attach')
          ? { payment_url: 'https://checkout.stripe.com/c/pay_test' }
          : { customer_id: 'workspace_10' },
      ),
    })) as unknown as typeof fetch;

    const result = await runAutumnAction('am_sk_test', {
      action: 'attach',
      workspaceId: '10',
      planId: 'pro',
      successUrl: 'https://app.alyson.ai/dashboard/alyson-pulse/billing',
    });

    expect(result.paymentUrl).toBe('https://checkout.stripe.com/c/pay_test');
  });
});
