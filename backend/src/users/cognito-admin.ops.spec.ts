import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsernameExistsException } from '@aws-sdk/client-cognito-identity-provider';
import { adminCreateUser, generateInviteTemporaryPassword } from './cognito-admin.ops';

describe('generateInviteTemporaryPassword', () => {
  it('meets Palisade min length and includes mixed character classes', () => {
    const password = generateInviteTemporaryPassword();
    expect(password.length).toBeGreaterThanOrEqual(8);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[0-9]/);
    expect(password).toMatch(/[!@#$%&*]/);
  });
});

describe('adminCreateUser', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('suppresses Cognito’s default email and returns the temp password', async () => {
    const send = vi.fn().mockResolvedValue({
      User: {
        Username: 'ada@cintara.ai',
        Attributes: [{ Name: 'sub', Value: 'sub-1' }],
      },
    });
    const result = await adminCreateUser({ send } as never, 'us-west-2_pool', {
      email: 'ada@cintara.ai',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(8);
    }
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0];
    expect(command.input.MessageAction).toBe('SUPPRESS');
    expect(command.input.TemporaryPassword).toBe(
      result.ok ? result.temporaryPassword : undefined,
    );
    expect(command.input.DesiredDeliveryMediums).toBeUndefined();
  });

  it('maps UsernameExistsException so Pulse can link without a new invite', async () => {
    const send = vi.fn().mockRejectedValue(
      new UsernameExistsException({ message: 'exists', $metadata: {} }),
    );
    const result = await adminCreateUser({ send } as never, 'us-west-2_pool', {
      email: 'ada@cintara.ai',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    expect(result).toEqual({
      ok: false,
      code: 'USERNAME_EXISTS',
      message: 'A user with this email already exists',
    });
  });
});
