import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../common/supabase.service';
import { DatabaseService } from '../database/database.service';
import { CognitoService } from './cognito.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  aud: string;
  exp: number;
  iat: number;
}

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
    private jwtService: JwtService,
    private configService: ConfigService,
    private supabaseService: SupabaseService,
    private databaseService: DatabaseService,
    private cognitoService: CognitoService,
  ) {}

  async getAuthProfile(token: string): Promise<AuthProfileResponse> {
    if (this.cognitoService.isEnabled() && this.databaseService.isEnabled()) {
      return this.getProfileFromCognitoToken(token);
    }
    const user = await this.getUserFromToken(token);
    const organization = user.organization_id
      ? await this.getOrganizationById(user.organization_id)
      : null;
    return { user, organization };
  }

  async getProfileFromCognitoToken(token: string): Promise<AuthProfileResponse> {
    const payload = await this.cognitoService.verifyIdToken(token);
    const email = payload.email?.toLowerCase();

    let user = await this.findUserByCognitoSub(payload.sub);

    if (!user && email) {
      user = await this.findUserByEmail(email);
      if (user) {
        await this.linkCognitoSub(user.id, payload.sub);
        user = { ...user, cognito_sub: payload.sub };
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
    const normalized = slug.trim().toLowerCase();
    if (this.databaseService.isEnabled()) {
      const result = await this.databaseService.query<OrganizationSummary>(
        `SELECT id, name, slug, logo_url, COALESCE(is_active, true) AS is_active
         FROM public.organizations
         WHERE lower(slug) = $1
         LIMIT 1`,
        [normalized],
      );
      return result.rows[0] ?? null;
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('organizations')
      .select('id, name, slug, logo_url, is_active')
      .eq('slug', normalized)
      .single();

    if (error || !data) return null;
    return data as OrganizationSummary;
  }

  async getOrganizationById(orgId: string): Promise<OrganizationSummary | null> {
    if (this.databaseService.isEnabled()) {
      const result = await this.databaseService.query<OrganizationSummary>(
        `SELECT id, name, slug, logo_url, COALESCE(is_active, true) AS is_active
         FROM public.organizations WHERE id = $1 LIMIT 1`,
        [orgId],
      );
      return result.rows[0] ?? null;
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('organizations')
      .select('id, name, slug, logo_url, is_active')
      .eq('id', orgId)
      .single();

    if (error || !data) return null;
    return data as OrganizationSummary;
  }

  private async findUserByCognitoSub(sub: string): Promise<User | null> {
    const result = await this.databaseService.query<User>(
      `SELECT id, email, full_name, role, avatar_url, organization_id,
              COALESCE(is_org_admin, false) AS is_org_admin,
              COALESCE(is_super_admin, false) AS is_super_admin,
              cognito_sub, created_at, updated_at
       FROM public.users WHERE cognito_sub = $1 LIMIT 1`,
      [sub],
    );
    return result.rows[0] ?? null;
  }

  private async findUserByEmail(email: string): Promise<User | null> {
    const result = await this.databaseService.query<User>(
      `SELECT id, email, full_name, role, avatar_url, organization_id,
              COALESCE(is_org_admin, false) AS is_org_admin,
              COALESCE(is_super_admin, false) AS is_super_admin,
              cognito_sub, created_at, updated_at
       FROM public.users WHERE lower(email) = $1 LIMIT 1`,
      [email],
    );
    return result.rows[0] ?? null;
  }

  private async linkCognitoSub(userId: string, cognitoSub: string): Promise<void> {
    await this.databaseService.query(
      `UPDATE public.users SET cognito_sub = $1, updated_at = NOW()
       WHERE id = $2 AND (cognito_sub IS NULL OR cognito_sub = $1)`,
      [cognitoSub, userId],
    );
  }

  async validateToken(token: string): Promise<JwtPayload> {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('SUPABASE_JWT_SECRET'),
      });

      return payload;
    } catch (error) {
      this.logger.error('Token validation failed:', error);
      throw new UnauthorizedException('Invalid token');
    }
  }

  async getUserFromToken(token: string): Promise<User> {
    if (this.cognitoService.isEnabled() && this.databaseService.isEnabled()) {
      const profile = await this.getProfileFromCognitoToken(token);
      return profile.user;
    }

    const payload = await this.validateToken(token);

    const { data: user, error } = await this.supabaseService
      .getClient()
      .from('users')
      .select('*')
      .eq('id', payload.sub)
      .single();

    if (error || !user) {
      this.logger.error('User not found:', error);
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  async validateUserRole(userId: string, requiredRoles: string[]): Promise<boolean> {
    if (this.databaseService.isEnabled()) {
      const result = await this.databaseService.query<{ role: string }>(
        `SELECT role FROM public.users WHERE id = $1 LIMIT 1`,
        [userId],
      );
      const user = result.rows[0];
      return user ? requiredRoles.includes(user.role) : false;
    }

    const { data: user, error } = await this.supabaseService
      .getClient()
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return false;
    }

    return requiredRoles.includes(user.role);
  }

  extractTokenFromHeader(authHeader: string): string {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid authorization header');
    }

    return authHeader.substring(7);
  }
}
