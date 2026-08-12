import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service';
import {
  parseTenantUserId,
  USER_PROFILE_SELECT,
  WORKSPACE_AS_ORG_SELECT,
} from '../database/time-doctor-sql';
import { CognitoService } from './cognito.service';
import { normalizeWorkTimezone } from '../lib/work-timezone';

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'manager' | 'user' | string;
  organization_id?: string | null;
  is_super_admin?: boolean;
  is_org_admin?: boolean;
  full_name?: string | null;
  avatar_url?: string | null;
  cognito_sub?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  is_active: boolean;
  /** IANA company/work-day TZ (Time Doctor Company Time Zone). */
  timezone?: string | null;
}

export interface AuthProfileResponse {
  user: User;
  organization: OrganizationSummary | null;
}

/**
 * Payload carried by the Palisade app token (x-auth-token / access_token).
 * Palisade signs `{ id: <tenant.user.id> }`; we also accept `sub` for tokens
 * minted by this backend's own /auth/token endpoint.
 */
export interface AppTokenPayload {
  id?: string | number;
  sub?: string;
  email?: string | null;
}

export interface AppTokenResponse {
  /** Palisade-style field name for the access token. */
  token: string;
  /** OAuth-style alias for the same access token. */
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: string;
  user: User;
  organization: OrganizationSummary | null;
}

export interface RefreshTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private configService: ConfigService,
    private databaseService: DatabaseService,
    private cognitoService: CognitoService,
    private jwtService: JwtService,
  ) {}

  async getAuthProfile(token: string): Promise<AuthProfileResponse> {
    if (!this.databaseService.isEnabled()) {
      throw new UnauthorizedException('Database not configured');
    }
    if (!this.cognitoService.isEnabled()) {
      throw new UnauthorizedException('Cognito not configured');
    }
    return this.getProfileFromCognitoToken(token);
  }

  async getProfileFromCognitoToken(token: string): Promise<AuthProfileResponse> {
    const payload = await this.cognitoService.verifyIdToken(token);
    const email = payload.email?.toLowerCase();

    let user = await this.findUserByCognitoSub(payload.sub);

    if (!user && email) {
      user = await this.findUserByEmail(email);
      if (user) {
        await this.ensureUserExtension(parseTenantUserId(user.id), payload.sub);
        user = (await this.findUserByCognitoSub(payload.sub)) ?? {
          ...user,
          cognito_sub: payload.sub,
        };
      }
    }

    if (!user) {
      this.logger.warn(`No RDS user for Cognito sub=${payload.sub}`);
      throw new UnauthorizedException(
        'Account not found. Ask your admin to add you in Alyson Pulse.',
      );
    }

    const organization = user.organization_id
      ? await this.getOrganizationById(user.organization_id)
      : null;

    return { user, organization };
  }

  /**
   * Palisade-style login: verify a Cognito id token once, then mint our own
   * app JWT that clients send back on every request (x-auth-token / access_token).
   */
  async issueAppToken(cognitoToken: string): Promise<AppTokenResponse> {
    if (!this.databaseService.isEnabled()) {
      throw new UnauthorizedException('Database not configured');
    }
    if (!this.cognitoService.isEnabled()) {
      throw new UnauthorizedException('Cognito not configured');
    }
    const { user, organization } = await this.getProfileFromCognitoToken(cognitoToken);
    const token = await this.signAccessToken(user.id, user.email);
    const refreshToken = await this.signRefreshToken(user.id, user.email);
    return {
      token,
      access_token: token,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: this.accessTokenTtl(),
      user,
      organization,
    };
  }

  /**
   * OAuth-style refresh (POST /oauth/v2/token, grant_type=refresh_token). Verifies the
   * refresh token and returns a new access token, matching what Alyson HR expects.
   */
  async refreshAppToken(refreshToken: string): Promise<RefreshTokenResponse> {
    let payload: AppTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AppTokenPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    const rawId = payload?.id ?? payload?.sub;
    if (rawId === undefined || rawId === null || String(rawId).trim() === '') {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.getUserById(String(rawId));
    if (!user) {
      throw new UnauthorizedException('Account not found');
    }
    return {
      access_token: await this.signAccessToken(user.id, user.email),
      refresh_token: await this.signRefreshToken(user.id, user.email),
      token_type: 'Bearer',
      expires_in: this.accessTokenTtl(),
    };
  }

  private accessTokenTtl(): string {
    return this.configService.get<string>('JWT_EXPIRES_IN', '1d');
  }

  private async signAccessToken(userId: string, email?: string | null): Promise<string> {
    // Match Palisade's payload shape so access tokens are interchangeable across backends.
    const payload: AppTokenPayload = { id: userId, email };
    return this.jwtService.signAsync(payload);
  }

  private async signRefreshToken(userId: string, email?: string | null): Promise<string> {
    const payload: AppTokenPayload & { typ: string } = { id: userId, email, typ: 'refresh' };
    return this.jwtService.signAsync(payload, {
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '30d'),
    });
  }

  /**
   * Verify a Palisade-compatible app JWT (x-auth-token / access_token) and resolve
   * the current user. Reads `id` (Palisade) or `sub` (this backend), then loads the
   * tenant.user fresh so roles/workspace are always current.
   *
   * NOTE: JWT_SECRET must equal Palisade's signing secret for Palisade-issued tokens
   * to validate here.
   */
  async getUserFromAppToken(token: string): Promise<User> {
    let payload: AppTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AppTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    const rawId = payload?.id ?? payload?.sub;
    if (rawId === undefined || rawId === null || String(rawId).trim() === '') {
      throw new UnauthorizedException('Invalid token');
    }
    const user = await this.getUserById(String(rawId));
    if (!user) {
      throw new UnauthorizedException('Account not found');
    }
    return user;
  }

  async getUserById(userId: string): Promise<User | null> {
    let uid: number;
    try {
      uid = parseTenantUserId(userId);
    } catch {
      return null;
    }
    const result = await this.databaseService.query<User>(
      `${USER_PROFILE_SELECT} WHERE u.id = $1::int LIMIT 1`,
      [uid],
    );
    return result.rows[0] ?? null;
  }

  async getOrganizationBySlug(slug: string): Promise<OrganizationSummary | null> {
    if (!this.databaseService.isEnabled()) return null;
    const normalized = slug.trim().toLowerCase();
    const result = await this.databaseService.query<OrganizationSummary>(
      `${WORKSPACE_AS_ORG_SELECT}
       WHERE lower(coalesce(w.key, w.id::text)) = $1
          OR w.id::text = $1
          OR lower(w.name) = $1
       LIMIT 1`,
      [normalized],
    );
    return result.rows[0] ?? null;
  }

  async getOrganizationById(orgId: string): Promise<OrganizationSummary | null> {
    if (!this.databaseService.isEnabled()) return null;
    const result = await this.databaseService.query<
      OrganizationSummary & { timezone: string | null }
    >(
      `SELECT
         w.id::text AS id,
         w.name,
         coalesce(nullif(lower(trim(w.key)), ''), w.id::text) AS slug,
         w.image_uri AS logo_url,
         coalesce(w.active, true) AS is_active,
         ws.settings->>'timezone' AS timezone
       FROM tenant.workspace w
       LEFT JOIN time_doctor.workspace_settings ws ON ws.workspace_id = w.id
       WHERE w.id = $1::int
       LIMIT 1`,
      [orgId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      ...row,
      timezone: normalizeWorkTimezone(row.timezone),
    };
  }

  private async findUserByCognitoSub(sub: string): Promise<User | null> {
    const result = await this.databaseService.query<User>(
      `${USER_PROFILE_SELECT} WHERE ext.cognito_sub = $1 LIMIT 1`,
      [sub],
    );
    return result.rows[0] ?? null;
  }

  private async findUserByEmail(email: string): Promise<User | null> {
    const result = await this.databaseService.query<User>(
      `${USER_PROFILE_SELECT} WHERE lower(u.email) = $1 LIMIT 1`,
      [email],
    );
    return result.rows[0] ?? null;
  }

  private async ensureUserExtension(userId: number, cognitoSub?: string): Promise<void> {
    const ws = await this.databaseService.query<{ workspace_id: number }>(
      `SELECT pw.workspace_id
       FROM tenant.profile p
       JOIN tenant.profile_workspace pw ON pw.profile_id = p.id
       WHERE p.user_id = $1 AND coalesce(pw.active, true) = true
       ORDER BY pw.id
       LIMIT 1`,
      [userId],
    );
    const workspaceId = ws.rows[0]?.workspace_id ?? null;
    await this.databaseService.query(
      `INSERT INTO time_doctor.user_extensions (user_id, workspace_id, cognito_sub)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         cognito_sub = COALESCE(time_doctor.user_extensions.cognito_sub, EXCLUDED.cognito_sub),
         workspace_id = COALESCE(time_doctor.user_extensions.workspace_id, EXCLUDED.workspace_id),
         updated_at = NOW()`,
      [userId, workspaceId, cognitoSub ?? null],
    );
  }

  async getUserFromToken(token: string): Promise<User> {
    const profile = await this.getProfileFromCognitoToken(token);
    return profile.user;
  }

  async validateUserRole(userId: string, requiredRoles: string[]): Promise<boolean> {
    const uid = parseTenantUserId(userId);
    const result = await this.databaseService.query<{ role: string }>(
      `SELECT coalesce(ext.pulse_role, 'employee') AS role
       FROM tenant."user" u
       LEFT JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
       WHERE u.id = $1
       LIMIT 1`,
      [uid],
    );
    const user = result.rows[0];
    return user ? requiredRoles.includes(user.role) : false;
  }

  extractTokenFromHeader(authHeader: string): string {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid authorization header');
    }
    return authHeader.substring(7);
  }
}
