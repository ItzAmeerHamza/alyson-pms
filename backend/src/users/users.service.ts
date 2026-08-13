import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  EMPLOYEE_USER_SELECT,
  ScopedAuthUser,
  parseWorkspaceId,
} from '../database/time-doctor-sql';
import { CognitoAdminService } from './cognito-admin.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly cognitoAdmin: CognitoAdminService,
  ) {}

  /**
   * Provisions an employee for Pulse:
   * - Cognito invite (or link existing Cognito user)
   * - Palisade tenant scaffolding (user/account/profile/profile_workspace)
   * - time_doctor.user_extensions + optional project assignments
   *
   * If the email already exists in tenant.user and/or Cognito, we link/update
   * Pulse rows instead of failing with "already exists".
   */
  async createUser(creator: ScopedAuthUser, dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    const firstName = dto.first_name.trim();
    const lastName = dto.last_name.trim();
    const department = dto.department?.trim() || null;
    const profileName = `${firstName} ${lastName}`.trim() || email;
    const workspaceRole =
      dto.role === 'admin' || dto.role === 'manager' ? 'admin' : 'member';

    const workspaceId = parseWorkspaceId(creator.organization_id);
    if (!workspaceId) {
      throw new BadRequestException(
        'Your account is not linked to an organization, so a workspace cannot be assigned to the new user',
      );
    }

    const existing = await this.db.query<{ id: string }>(
      `SELECT id::text AS id FROM tenant."user" WHERE lower(email) = $1 LIMIT 1`,
      [email],
    );
    const existingUserId = existing.rows[0]?.id ?? null;

    const cognito = await this.cognitoAdmin.createUser({ email, firstName, lastName });
    if (!cognito.created) {
      this.logger.log(`Linking existing Cognito user for ${email} (no new invite email)`);
    }

    const client = await this.db.getClient();
    let userId: string;
    try {
      await client.query('BEGIN');

      if (existingUserId) {
        userId = existingUserId;
        await client.query(
          `UPDATE tenant."user"
           SET first_name = COALESCE(NULLIF($1, ''), first_name),
               last_name = COALESCE(NULLIF($2, ''), last_name),
               last_modified = NOW()
           WHERE id = $3::int`,
          [firstName, lastName, userId],
        );
      } else {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO tenant."user" (first_name, last_name, phone_number, email, created, last_modified)
           VALUES ($1, $2, '', $3, NOW(), NOW())
           RETURNING id::text AS id`,
          [firstName, lastName, email],
        );
        userId = inserted.rows[0].id;
      }

      const account = await client.query<{ id: string }>(
        `SELECT id::text AS id FROM tenant.account WHERE user_id = $1::int LIMIT 1`,
        [userId],
      );
      if (!account.rows[0]) {
        await client.query(
          `INSERT INTO tenant.account (name, user_id, contact_name, contact_email, active)
           VALUES ('default', $1::int, $2, $3, true)`,
          [userId, firstName || 'User', email],
        );
      }

      let buyerProfileId: string | null = null;
      const buyer = await client.query<{ id: string }>(
        `SELECT id::text AS id
         FROM tenant.profile
         WHERE user_id = $1::int AND profile_type = 'buyer'
         LIMIT 1`,
        [userId],
      );
      if (buyer.rows[0]) {
        buyerProfileId = buyer.rows[0].id;
      } else {
        const profile = await client.query<{ id: string }>(
          `INSERT INTO tenant.profile (name, user_id, profile_type, email, active)
           VALUES ($1, $2::int, 'buyer', $3, true)
           RETURNING id::text AS id`,
          [profileName, userId, email],
        );
        buyerProfileId = profile.rows[0].id;
      }

      const pw = await client.query(
        `SELECT 1
         FROM tenant.profile_workspace
         WHERE profile_id = $1::int AND workspace_id = $2
         LIMIT 1`,
        [buyerProfileId, workspaceId],
      );
      if (!pw.rows[0]) {
        await client.query(
          `INSERT INTO tenant.profile_workspace
             (profile_id, workspace_id, account_role, workspace_role, active)
           VALUES ($1::int, $2, 'buyer', $3, true)`,
          [buyerProfileId, workspaceId, workspaceRole],
        );
      }

      await client.query(
        `INSERT INTO time_doctor.user_extensions
           (user_id, workspace_id, cognito_sub, pulse_role, department, started_on, created_at, updated_at)
         VALUES ($1::int, $2, $3, $4, $5, CURRENT_DATE, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           workspace_id = EXCLUDED.workspace_id,
           cognito_sub = COALESCE(EXCLUDED.cognito_sub, time_doctor.user_extensions.cognito_sub),
           pulse_role = EXCLUDED.pulse_role,
           department = COALESCE(EXCLUDED.department, time_doctor.user_extensions.department),
           started_on = COALESCE(time_doctor.user_extensions.started_on, EXCLUDED.started_on),
           updated_at = NOW()`,
        [userId, workspaceId, cognito.sub, dto.role, department],
      );

      const projectIds = Array.from(
        new Set((dto.project_ids || []).map((id) => String(id).trim()).filter(Boolean)),
      );
      if (projectIds.length > 0) {
        await client.query(
          `INSERT INTO time_doctor.employee_project_assignments (user_id, project_id, created_at)
           SELECT $1::int, p.id, NOW()
           FROM time_doctor.projects p
           WHERE p.workspace_id = $2
             AND p.id = ANY($3::uuid[])
           ON CONFLICT (user_id, project_id) DO NOTHING`,
          [userId, workspaceId, projectIds],
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      // Only roll back Cognito when we just created the pool user (not when linking).
      if (cognito.created && !existingUserId) {
        await this.cognitoAdmin.deleteUser(cognito.username);
      }
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to persist user ${email}: ${detail}`);
      const permissionDenied = /permission denied/i.test(detail);
      throw new BadRequestException(
        permissionDenied
          ? 'Failed to create user: database role is missing write grants (run migration 009_grant_tenant_user_write.sql as postgres)'
          : 'Failed to create user',
      );
    } finally {
      client.release();
    }

    const created = await this.db.query(
      `${EMPLOYEE_USER_SELECT} WHERE u.id = $1 LIMIT 1`,
      [userId],
    );
    return {
      ...(created.rows[0] ?? { id: userId, email, role: dto.role }),
      linked_existing: Boolean(existingUserId) || !cognito.created,
    };
  }
}
