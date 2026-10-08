import { autumnPost } from './autumn.client';
import {
  BILLING_FEATURE_IDS,
  BILLING_PLANS,
  workspaceCustomerId,
} from './billing.catalog';

export type AutumnAction =
  | { action: 'ensure'; workspaceId: string; name?: string }
  | { action: 'entitlements'; workspaceId: string; name?: string }
  | { action: 'check'; workspaceId: string; featureId: string }
  | { action: 'attach'; workspaceId: string; name?: string; planId: string; successUrl?: string }
  | { action: 'portal'; workspaceId: string; returnUrl?: string };

export type EntitlementsResult = {
  enabled: true;
  customerId: string;
  features: Record<string, boolean>;
  seatsRemaining: number | null;
  plans: Array<{ id: string; name: string }>;
};

function customerBody(workspaceId: string, name?: string): Record<string, unknown> {
  return {
    customer_id: workspaceCustomerId(workspaceId),
    ...(name ? { name } : {}),
  };
}

async function ensureCustomer(secret: string, workspaceId: string, name?: string): Promise<string> {
  const customerId = workspaceCustomerId(workspaceId);
  await autumnPost(secret, '/v1/customers.get_or_create', customerBody(workspaceId, name));
  return customerId;
}

function remainingOf(payload: Record<string, unknown>): number | null {
  const balance = payload.balance;
  if (!balance || typeof balance !== 'object' || Array.isArray(balance)) return null;
  const remaining = (balance as { remaining?: unknown }).remaining;
  return typeof remaining === 'number' ? remaining : null;
}

export async function runAutumnAction(
  secret: string,
  event: AutumnAction,
): Promise<Record<string, unknown>> {
  if (event.action === 'ensure') {
    const customerId = await ensureCustomer(secret, event.workspaceId, event.name);
    return { customerId };
  }

  if (event.action === 'check') {
    const customerId = await ensureCustomer(secret, event.workspaceId);
    const checked = await autumnPost(secret, '/v1/balances.check', {
      customer_id: customerId,
      feature_id: event.featureId,
      required_balance: 1,
    });
    return {
      allowed: checked.allowed === true,
      remaining: remainingOf(checked),
    };
  }

  if (event.action === 'entitlements') {
    const customerId = await ensureCustomer(secret, event.workspaceId, event.name);
    const features: Record<string, boolean> = {};
    let seatsRemaining: number | null = null;
    await Promise.all(
      BILLING_FEATURE_IDS.map(async (featureId) => {
        const checked = await autumnPost(secret, '/v1/balances.check', {
          customer_id: customerId,
          feature_id: featureId,
          required_balance: 1,
        });
        features[featureId] = checked.allowed === true;
        if (featureId === 'seats') seatsRemaining = remainingOf(checked);
      }),
    );
    const result: EntitlementsResult = {
      enabled: true,
      customerId,
      features,
      seatsRemaining,
      plans: BILLING_PLANS.map((plan) => ({ id: plan.id, name: plan.name })),
    };
    return result as unknown as Record<string, unknown>;
  }

  if (event.action === 'attach') {
    const customerId = await ensureCustomer(secret, event.workspaceId, event.name);
    const attached = await autumnPost(secret, '/v1/billing.attach', {
      customer_id: customerId,
      plan_id: event.planId,
      redirect_mode: 'always',
      ...(event.successUrl ? { success_url: event.successUrl } : {}),
    });
    return {
      paymentUrl: typeof attached.payment_url === 'string' ? attached.payment_url : null,
    };
  }

  const customerId = await ensureCustomer(secret, event.workspaceId);
  const portal = await autumnPost(secret, '/v1/billing.open_customer_portal', {
    customer_id: customerId,
    ...(event.returnUrl ? { return_url: event.returnUrl } : {}),
  });
  return {
    url: typeof portal.url === 'string' ? portal.url : null,
  };
}
