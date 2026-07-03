import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import {
  parseTenantUserId,
  USER_PROFILE_SELECT,
  WORKSPACE_AS_ORG_SELECT,
} from '../database/time-doctor-sql';
import { CognitoService } from './cognito.service';

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
}

export interface AuthProfileResponse {
  user: User;
  organization: OrganizationSummary | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private configService: ConfigService,
    private databaseService: DatabaseService,
    private cognitoService: CognitoService,
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
        'Account not found. Ask your admin to add you or link your Cognito user.',
      );
    }

    const organization = user.organization_id
      ? await this.getOrganizationById(user.organization_id)
      : null;

    return { user, organization };
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
    const result = await this.databaseService.query<OrganizationSummary>(
      `${WORKSPACE_AS_ORG_SELECT} WHERE w.id = $1::int LIMIT 1`,
      [orgId],
    );
    return result.rows[0] ?? null;
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
