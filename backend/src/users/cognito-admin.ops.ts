import { randomInt } from 'crypto';
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
  UserNotFoundException,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';

export type CognitoAdminCreateOk = {
  ok: true;
  sub: string;
  username: string;
  /** Present only for newly created users — used for the Pulse invite email. */
  temporaryPassword: string;
};
export type CognitoAdminCreateErr = {
  ok: false;
  code: 'USERNAME_EXISTS' | 'MISSING_IDENTIFIER' | 'ERROR';
  message: string;
};
export type CognitoAdminCreateResult = CognitoAdminCreateOk | CognitoAdminCreateErr;

export type CognitoAdminGetOk = { ok: true; sub: string; username: string };
export type CognitoAdminGetErr = {
  ok: false;
  code: 'NOT_FOUND' | 'MISSING_IDENTIFIER' | 'ERROR';
  message: string;
};
export type CognitoAdminGetResult = CognitoAdminGetOk | CognitoAdminGetErr;

export type CognitoAdminDeleteResult =
  | { ok: true }
  | { ok: false; code: 'ERROR'; message: string };

/**
 * Cognito pool min length can be 6, but Palisade sign-in validates min 8
 * client-side — auto-generated temps can be rejected before Amplify runs.
 */
export function generateInviteTemporaryPassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*';
  const all = upper + lower + digits + symbols;
  const pick = (chars: string) => chars[randomInt(chars.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < length) {
    chars.push(pick(all));
  }
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export async function adminCreateUser(
  client: CognitoIdentityProviderClient,
  userPoolId: string,
  input: { email: string; firstName: string; lastName: string },
): Promise<CognitoAdminCreateResult> {
  try {
    const temporaryPassword = generateInviteTemporaryPassword();
    const result = await client.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: input.email,
        TemporaryPassword: temporaryPassword,
        // Pulse sends its own SES invite — do not use Cognito's default email.
        MessageAction: 'SUPPRESS',
        UserAttributes: [
          { Name: 'email', Value: input.email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'given_name', Value: input.firstName },
          { Name: 'family_name', Value: input.lastName },
        ],
      }),
    );

    const attributes = result.User?.Attributes ?? [];
    const sub = attributes.find((attr) => attr.Name === 'sub')?.Value;
    const username = result.User?.Username;
    if (!sub || !username) {
      return { ok: false, code: 'MISSING_IDENTIFIER', message: 'Cognito did not return a user identifier' };
    }
    return { ok: true, sub, username, temporaryPassword };
  } catch (error) {
    if (error instanceof UsernameExistsException) {
      return { ok: false, code: 'USERNAME_EXISTS', message: 'A user with this email already exists' };
    }
    return {
      ok: false,
      code: 'ERROR',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Look up an existing pool user by username/email (no invite email sent). */
export async function adminGetUser(
  client: CognitoIdentityProviderClient,
  userPoolId: string,
  username: string,
): Promise<CognitoAdminGetResult> {
  try {
    const result = await client.send(
      new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: username,
      }),
    );
    const attributes = result.UserAttributes ?? [];
    const sub = attributes.find((attr) => attr.Name === 'sub')?.Value;
    const resolvedUsername = result.Username;
    if (!sub || !resolvedUsername) {
      return { ok: false, code: 'MISSING_IDENTIFIER', message: 'Cognito did not return a user identifier' };
    }
    return { ok: true, sub, username: resolvedUsername };
  } catch (error) {
    if (error instanceof UserNotFoundException) {
      return { ok: false, code: 'NOT_FOUND', message: 'User not found in Cognito' };
    }
    return {
      ok: false,
      code: 'ERROR',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function adminDeleteUser(
  client: CognitoIdentityProviderClient,
  userPoolId: string,
  username: string,
): Promise<CognitoAdminDeleteResult> {
  try {
    await client.send(
      new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: username }),
    );
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      code: 'ERROR',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
