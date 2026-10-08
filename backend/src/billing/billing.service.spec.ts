import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BillingService } from './billing.service';

function service(env: Record<string, string>) {
  return new BillingService({
    get: (key: string) => env[key],
  } as never);
}

describe('BillingService', () => {
  it('leaves every feature on when Autumn is not configured', async () => {
    const billing = service({});
    const result = await billing.entitlements('10');
    expect(result.enabled).toBe(false);
    expect(result.features.team_reports).toBe(true);
    await expect(billing.assertFeature({ organization_id: '10' }, 'leave')).resolves.toBeUndefined();
  });

  it('rejects a feature Autumn marks as not allowed', async () => {
    const billing = service({ AUTUMN_SECRET_KEY: 'am_sk_test' });
    vi.spyOn(billing as unknown as { dispatch: () => Promise<unknown> }, 'dispatch').mockResolvedValue({
      allowed: false,
    });
    await expect(billing.assertFeature({ organization_id: '10' }, 'leave')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('stays open when Autumn cannot be reached', async () => {
    const billing = service({ AUTUMN_SECRET_KEY: 'am_sk_test' });
    vi.spyOn(billing as unknown as { dispatch: () => Promise<unknown> }, 'dispatch').mockRejectedValue(
      new Error('Autumn request failed'),
    );
    await expect(billing.assertFeature({ organization_id: '10' }, 'leave')).resolves.toBeUndefined();
  });
});
