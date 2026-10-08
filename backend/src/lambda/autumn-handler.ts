import { AutumnAction, runAutumnAction } from '../billing/autumn.actions';

/**
 * Non-VPC Lambda. The API Lambda has no NAT, so Autumn Cloud is called from here.
 * AUTUMN_SECRET_KEY stays on this function.
 */
export const handler = async (event: AutumnAction) => {
  const secret = (process.env.AUTUMN_SECRET_KEY || '').trim();
  if (!secret) {
    return { ok: false, message: 'Autumn is not configured' };
  }
  if (!event?.action || !event.workspaceId) {
    return { ok: false, message: 'Invalid Autumn request' };
  }
  try {
    const result = await runAutumnAction(secret, event);
    return { ok: true, result };
  } catch (err) {
    console.error(`Autumn request failed: ${err instanceof Error ? err.message : 'failed'}`);
    return { ok: false, message: 'Autumn request failed' };
  }
};
