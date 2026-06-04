import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';

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

@Injectable()
export class CognitoService {
  private readonly logger = new Logger(CognitoService.name);
  private jwksClient: JwksClient | null = null;
  private readonly enabled: boolean;
  private readonly region: string;
  private readonly userPoolId: string;
  private readonly clientId: string;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>('COGNITO_REGION', '');
    this.userPoolId = this.configService.get<string>('COGNITO_USER_POOL_ID', '');
    this.clientId = this.configService.get<string>('COGNITO_CLIENT_ID', '');
    this.enabled = Boolean(this.region && this.userPoolId && this.clientId);

    if (this.enabled) {
      const issuer = this.getIssuer();
      this.jwksClient = new JwksClient({
        jwksUri: `${issuer}/.well-known/jwks.json`,
        cache: true,
        rateLimit: true,
      });
      this.logger.log(`Cognito JWT verification enabled (${issuer})`);
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
        audience: this.clientId,
        algorithms: ['RS256'],
      }) as CognitoIdTokenPayload;

      if (payload.token_use && payload.token_use !== 'id') {
        throw new UnauthorizedException('Expected Cognito id token');
      }

      return payload;
    } catch (error) {
      this.logger.warn('Cognito token verification failed');
      throw new UnauthorizedException('Invalid token');
    }
  }
}
