import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';

const hamza = {
  id: '9',
  email: 'hamza@cintara.ai',
  role: 'admin',
  full_name: 'Hamza',
  organization_id: '511',
  is_super_admin: true,
  signed_in_at: '2026-10-01T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const company = {
  id: '511',
  name: 'Cintara',
  slug: 'cintara',
  logo_url: null,
  is_active: true,
  timezone: 'America/Los_Angeles',
};

function makeService(user = hamza) {
  const query = vi.fn(async (sql: string) => {
    if (String(sql).includes('FROM tenant."user"')) return { rows: [user] };
    if (String(sql).includes('FROM tenant.workspace')) return { rows: [company] };
    return { rows: [] };
  });
  const recordFirstSignIn = vi.fn(async (_userId: number) => false);
  const databaseService = { isEnabled: () => true, query };
  const cognitoService = {
    isEnabled: () => true,
    verifyIdToken: vi.fn(async () => ({ sub: 'cognito-sub', email: user.email })),
  };
  return {
    service: new AuthService(
      { get: () => undefined } as never,
      databaseService as never,
      cognitoService as never,
      { signAsync: vi.fn(async () => 'token') } as never,
      { recordFirstSignIn } as never,
    ),
    query,
    recordFirstSignIn,
  };
}

describe('AuthService.getAuthProfile', () => {
  it('returns the super-admin home company when Tavilo sends no company header', async () => {
    const { service } = makeService();
    const profile = await service.getAuthProfile('cognito-id-token');
    expect(profile.user.email).toBe('hamza@cintara.ai');
    expect(profile.user.organization_id).toBe('511');
    expect(profile.organization).toMatchObject({ id: '511', name: 'Cintara' });
  });

  it('uses a companies-page workspace id instead of the home company', async () => {
    const { service, query } = makeService();
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (String(sql).includes('FROM tenant."user"')) return { rows: [hamza] };
      if (params?.[0] === '99') {
        return { rows: [{ ...company, id: '99', name: 'Other Co' }] };
      }
      return { rows: [company] };
    });
    const profile = await service.getAuthProfile('cognito-id-token', '99');
    expect(profile.user.organization_id).toBe('99');
    expect(profile.organization?.name).toBe('Other Co');
  });

  it('returns no company for a super-admin who has no home workspace', async () => {
    const { service } = makeService({ ...hamza, organization_id: null });
    const profile = await service.getAuthProfile('cognito-id-token');
    expect(profile.organization).toBeNull();
    expect(profile.user.organization_id).toBeNull();
  });

  it('records the first sign-in for a user who has never signed in', async () => {
    const { service, recordFirstSignIn } = makeService({ ...hamza, signed_in_at: null as never });
    await service.getAuthProfile('cognito-id-token');
    expect(recordFirstSignIn).toHaveBeenCalledTimes(1);
    expect(recordFirstSignIn).toHaveBeenCalledWith(9);
  });

  it('does not touch activation for a user who is already active', async () => {
    const { service, recordFirstSignIn } = makeService();
    await service.getAuthProfile('cognito-id-token');
    expect(recordFirstSignIn).not.toHaveBeenCalled();
  });

  it('still signs the user in when activation throws', async () => {
    const { service, recordFirstSignIn } = makeService({ ...hamza, signed_in_at: null as never });
    recordFirstSignIn.mockRejectedValueOnce(new Error('ses exploded'));
    const profile = await service.getAuthProfile('cognito-id-token');
    expect(profile.user.email).toBe('hamza@cintara.ai');
  });

  it('leaves a company admin on their own workspace when a header is sent', async () => {
    const { service } = makeService({ ...hamza, is_super_admin: false });
    const profile = await service.getAuthProfile('cognito-id-token', '99');
    expect(profile.user.organization_id).toBe('511');
    expect(profile.organization?.id).toBe('511');
  });
});
