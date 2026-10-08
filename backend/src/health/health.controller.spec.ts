import { describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController ping cache', () => {
  it('does not open a second RDS connection within 15s', async () => {
    const ping = vi.fn(async () => ({ ok: true, latencyMs: 3 }));
    const controller = new HealthController({
      isEnabled: () => true,
      ping,
    } as never);

    await controller.check();
    await controller.check();

    expect(ping).toHaveBeenCalledTimes(1);
  });
});
