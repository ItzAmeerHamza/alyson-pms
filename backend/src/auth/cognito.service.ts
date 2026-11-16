import { createPublicKey } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { JwksClient, SigningKey } from 'jwks-rsa';

/** Password app client in user pool us-west-2_ZL4ElZy4r. */
export const PASSWORD_APP_CLIENT_ID = 'hrp03a37bqti7capfoptd8737';
/** Tavilo Google web app client in the same user pool. */
export const TAVILO_WEB_APP_CLIENT_ID = '77fbgec7tr6avhv5m5u4gnkdh0';

/**
 * Configured clients, plus the password app and the Tavilo web app.
 * An empty configuration leaves Cognito disabled. Any other client is refused.
 */
export function resolveCognitoClientIds(configured: string | undefined): string[] {
  const fromEnv = String(configured || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (!fromEnv.length) return [];
  return [...new Set([...fromEnv, PASSWORD_APP_CLIENT_ID, TAVILO_WEB_APP_CLIENT_ID])];
}

export interface CognitoIdTokenPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  aud: string;
  iss: string;
  token_use: string;
  exp: number;
  iat: number;
}

type JwkKey = { kid?: string; kty?: string; [key: string]: unknown };

function loadBundledJwks(): JwkKey[] | null {
  const candidates = [
    path.join(process.cwd(), 'cognito-jwks.json'),
    path.join(__dirname, '../../cognito-jwks.json'),
    path.join(__dirname, '../cognito-jwks.json'),
  ];
  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { keys?: JwkKey[] };
      if (Array.isArray(parsed.keys) && parsed.keys.length > 0) {
        return parsed.keys;
      }
    } catch {
      /* try next path */
    }
  }
  return null;
}

function signingKeyFromJwk(jwk: JwkKey): SigningKey {
  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  return {
    kid: String(jwk.kid || ''),
    getPublicKey: () => pem,
  } as SigningKey;
}

function createBundledJwksClient(keys: JwkKey[]): JwksClient {
  const byKid = new Map(keys.filter((k) => k.kid).map((k) => [String(k.kid), k]));
  return {
    getSigningKey: (kid: string) => {
      const jwk = byKid.get(kid);
      if (!jwk) {
        return Promise.reject(new Error(`JWK kid ${kid} not found in bundled Cognito keys`));
      }
      return Promise.resolve(signingKeyFromJwk(jwk));
    },
  } as unknown as JwksClient;
}

@Injectable()
export class CognitoService {
  private readonly logger = new Logger(CognitoService.name);
  private jwksClient: JwksClient | null = null;
  private readonly enabled: boolean;
  private readonly region: string;
  private readonly userPoolId: string;
  private readonly clientIds: string[];

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>('COGNITO_REGION', '');
    this.userPoolId = this.configService.get<string>('COGNITO_USER_POOL_ID', '');
    const configured =
      this.configService.get<string>('COGNITO_CLIENT_IDS') ||
      this.configService.get<string>('COGNITO_CLIENT_ID', '');
    this.clientIds = resolveCognitoClientIds(configured);
    this.enabled = Boolean(this.region && this.userPoolId && this.clientIds.length);

    if (this.enabled) {
      const issuer = this.getIssuer();
      const bundled = loadBundledJwks();
      if (bundled) {
        this.jwksClient = createBundledJwksClient(bundled);
        this.logger.log(`Cognito JWT verification enabled with bundled JWKS (${issuer})`);
      } else {
        this.jwksClient = new JwksClient({
          jwksUri: `${issuer}/.well-known/jwks.json`,
          cache: true,
          rateLimit: true,
        });
        this.logger.log(`Cognito JWT verification enabled via remote JWKS (${issuer})`);
      }
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getIssuer(): string {
    return `https://cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}`;
  }

  async verifyIdToken(token: string): Promise<CognitoIdTokenPayload> {
    if (!this.enabled || !this.jwksClient) {
      throw new UnauthorizedException('Cognito is not configured');
    }

    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
      throw new UnauthorizedException('Invalid token');
    }

    const key = await this.jwksClient.getSigningKey(decoded.header.kid);
    const signingKey = key.getPublicKey();

    try {
      const payload = jwt.verify(token, signingKey, {
        issuer: this.getIssuer(),
        audience: this.clientIds,
        algorithms: ['RS256'],
      }) as CognitoIdTokenPayload;

      if (payload.token_use && payload.token_use !== 'id') {
        throw new UnauthorizedException('Expected Cognito id token');
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Cognito token verification failed: ${detail}`);
      throw new UnauthorizedException('Invalid token');
    }
  }
}
