import { generateKeyPairSync } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { AuthGuard } from './auth.guard';
import {
  CognitoService,
  PASSWORD_APP_CLIENT_ID,
  resolveCognitoClientIds,
  TAVILO_WEB_APP_CLIENT_ID,
} from './cognito.service';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
const kid = 'test-kid';
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const issuer = 'https://cognito-idp.us-west-2.amazonaws.com/us-west-2_TestPool';

function sign(claims: Record<string, unknown> = {}, key = privateKey): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: 'user-sub',
      aud: PASSWORD_APP_CLIENT_ID,
      iss: issuer,
      token_use: 'id',
      email: 'person@example.com',
      email_verified: true,
      iat: now,
      exp: now + 3600,
      ...claims,
    },
    key,
    { algorithm: 'RS256', keyid: kid },
  );
}

function service(): CognitoService {
  const values: Record<string, string> = {
    COGNITO_REGION: 'us-west-2',
    COGNITO_USER_POOL_ID: 'us-west-2_TestPool',
    COGNITO_CLIENT_ID: PASSWORD_APP_CLIENT_ID,
  };
  const created = new CognitoService({
    get: (key: string, fallback?: string) => values[key] ?? fallback ?? '',
  } as never);
  (created as unknown as { jwksClient: { getSigningKey: (id: string) => Promise<unknown> } }).jwksClient =
    {
      getSigningKey: async (requested: string) => {
        if (requested !== kid) throw new Error('unknown kid');
        return { getPublicKey: () => publicPem };
      },
    };
  return created;
}

describe('Cognito client allowlist', () => {
  it('keeps the password client and adds the Tavilo web client', () => {
    expect(resolveCognitoClientIds(PASSWORD_APP_CLIENT_ID)).toEqual([
      PASSWORD_APP_CLIENT_ID,
      TAVILO_WEB_APP_CLIENT_ID,
    ]);
  });

  it('does not add any client besides the password app and the Tavilo web app', () => {
    expect(resolveCognitoClientIds(PASSWORD_APP_CLIENT_ID)).not.toContain('some-other-client');
  });

  it('stays disabled when no client is configured', () => {
    const off = new CognitoService({ get: () => '' } as never);
    expect(off.isEnabled()).toBe(false);
  });
});

describe('Cognito ID token verification', () => {
  const cognito = service();

  it('accepts a password-client ID token and a Tavilo web-client ID token', async () => {
    await expect(cognito.verifyIdToken(sign())).resolves.toMatchObject({
      aud: PASSWORD_APP_CLIENT_ID,
      token_use: 'id',
    });
    await expect(
      cognito.verifyIdToken(sign({ aud: TAVILO_WEB_APP_CLIENT_ID })),
    ).resolves.toMatchObject({ aud: TAVILO_WEB_APP_CLIENT_ID });
  });

  it('rejects a bad signature, the wrong issuer, the wrong client, an expired token, and an access token', async () => {
    await expect(cognito.verifyIdToken(sign({}, otherKey))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      cognito.verifyIdToken(sign({ iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_Other' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(cognito.verifyIdToken(sign({ aud: 'some-other-client' }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(cognito.verifyIdToken(sign({ exp: Math.floor(Date.now() / 1000) - 60 }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(cognito.verifyIdToken(sign({ token_use: 'access' }))).rejects.toThrow(
      /Expected Cognito id token/,
    );
  });
});

describe('dashboard auth guard', () => {
  it('rejects a request with no authorization header', async () => {
    const guard = new AuthGuard(
      {
        getUserFromAppToken: async () => {
          throw new Error('unused');
        },
        getUserFromToken: async () => {
          throw new Error('unused');
        },
      } as never,
      { getAllAndOverride: () => false } as unknown as Reflector,
    );
    await expect(
      guard.canActivate({
        getHandler: () => undefined,
        getClass: () => undefined,
        switchToHttp: () => ({ getRequest: () => ({ headers: {}, query: {} }) }),
      } as never),
    ).rejects.toThrow(/Authentication token missing/);
  });
});
