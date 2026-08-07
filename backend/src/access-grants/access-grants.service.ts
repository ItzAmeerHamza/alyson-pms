import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  EMPLOYEE_USER_SELECT,
  ScopedAuthUser,
  parseTenantUserId,
  parseWorkspaceId,
  workspaceScope,
} from '../database/time-doctor-sql';

export interface AccessGrantRow {
  id: number;
  workspace_id: string;
  grantee_user_id: string;
  grantee_name: string | null;
  grantee_email: string;
  granted_by: string;
  granted_by_name: string | null;
  created_at: string;
  updated_at: string;
  target_user_ids: string[];
  targets: Array<{ id: string; full_name: string | null; email: string }>;
}

@Injectable()
export class AccessGrantsService {
  constructor(private readonly db: DatabaseService) {}

  /** Target employee ids the grantee may view (screenshots + reports). Empty = no grant. */
  async getGrantedTargetIds(user: ScopedAuthUser): Promise<string[]> {
    const uid = parseTenantUserId(user.id);
    const wsId = parseWorkspaceId(user.organization_id);
    const params: unknown[] = [uid];
    let workspaceFilter = '';
    if (wsId) {
      params.push(wsId);
      workspaceFilter = ` AND g.workspace_id = $${params.length}`;
    }
    const result = await this.db.query<{ target_user_id: string }>(
      `SELECT t.target_user_id::text AS target_user_id
       FROM time_doctor.access_grants g
       JOIN time_doctor.access_grant_targets t ON t.grant_id = g.id
       WHERE g.grantee_user_id = $1
         ${workspaceFilter}`,
      params,
    );
    return result.rows.map((r) => r.target_user_id);
  }

  async listGrants(admin: ScopedAuthUser): Promise<AccessGrantRow[]> {
    const scope = workspaceScope(admin, 'g');
    const grants = await this.db.query<{
      id: number;
      workspace_id: string;
      grantee_user_id: string;
      grantee_name: string | null;
      grantee_email: string;
      granted_by: string;
      granted_by_name: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT
         g.id,
         g.workspace_id::text AS workspace_id,
         g.grantee_user_id::text AS grantee_user_id,
         trim(both ' ' from coalesce(gu.first_name, '') || ' ' || coalesce(gu.last_name, '')) AS grantee_name,
         gu.email AS grantee_email,
         g.granted_by::text AS granted_by,
         trim(both ' ' from coalesce(bu.first_name, '') || ' ' || coalesce(bu.last_name, '')) AS granted_by_name,
         g.created_at::text AS created_at,
         g.updated_at::text AS updated_at
       FROM time_doctor.access_grants g
       JOIN tenant."user" gu ON gu.id = g.grantee_user_id
       JOIN tenant."user" bu ON bu.id = g.granted_by
       WHERE ${scope.clause}
       ORDER BY g.updated_at DESC`,
      scope.params,
    );

    if (!grants.rows.length) return [];

    const grantIds = grants.rows.map((g) => g.id);
    const targets = await this.db.query<{
      grant_id: number;
      id: string;
      full_name: string | null;
      email: string;
    }>(
      `SELECT
         t.grant_id,
         u.id::text AS id,
         trim(both ' ' from coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS full_name,
         u.email
       FROM time_doctor.access_grant_targets t
       JOIN tenant."user" u ON u.id = t.target_user_id
       WHERE t.grant_id = ANY($1::int[])
       ORDER BY full_name ASC NULLS LAST`,
      [grantIds],
    );

    const byGrant = new Map<number, Array<{ id: string; full_name: string | null; email: string }>>();
    for (const row of targets.rows) {
      if (!byGrant.has(row.grant_id)) byGrant.set(row.grant_id, []);
      byGrant.get(row.grant_id)!.push({
        id: row.id,
        full_name: row.full_name,
        email: row.email,
      });
    }

    return grants.rows.map((g) => {
      const list = byGrant.get(g.id) ?? [];
      return {
        ...g,
        target_user_ids: list.map((t) => t.id),
        targets: list,
      };
    });
  }

  async createGrant(
    admin: ScopedAuthUser,
    body: { grantee_user_id: string; target_user_ids: string[] },
  ): Promise<AccessGrantRow> {
    const wsId = parseWorkspaceId(admin.organization_id);
    if (!wsId) {
      throw new BadRequestException('Your account is not linked to an organization');
    }
    const granteeId = parseTenantUserId(body.grantee_user_id);
    const targetIds = this.normalizeTargetIds(body.target_user_ids);
    if (!targetIds.length) {
      throw new BadRequestException('Select at least one employee to grant access to');
    }
    if (targetIds.includes(granteeId)) {
      throw new BadRequestException('A user cannot be granted access to themselves via this form');
    }

    await this.assertUsersInWorkspace(wsId, [granteeId, ...targetIds]);

    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO time_doctor.access_grants
           (workspace_id, grantee_user_id, granted_by, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         RETURNING id`,
        [wsId, granteeId, parseTenantUserId(admin.id)],
      );
      const grantId = inserted.rows[0].id;
      for (const targetId of targetIds) {
        await client.query(
          `INSERT INTO time_doctor.access_grant_targets (grant_id, target_user_id)
           VALUES ($1, $2)`,
          [grantId, targetId],
        );
      }
      await client.query('COMMIT');
    } catch (error: any) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (error?.code === '23505') {
        throw new ConflictException(
          'This user already has an access grant. Edit the existing grant instead.',
        );
      }
      throw error;
    } finally {
      client.release();
    }

    const all = await this.listGrants(admin);
    const created = all.find((g) => g.grantee_user_id === String(granteeId));
    if (!created) throw new NotFoundException('Grant created but could not be loaded');
    return created;
  }

  async updateGrant(
    admin: ScopedAuthUser,
    grantId: number,
    body: { target_user_ids: string[] },
  ): Promise<AccessGrantRow> {
    const scope = workspaceScope(admin, 'g');
    const existing = await this.db.query<{ id: number; grantee_user_id: string }>(
      `SELECT g.id, g.grantee_user_id::text AS grantee_user_id
       FROM time_doctor.access_grants g
       WHERE ${scope.clause}
         AND g.id = $${scope.params.length + 1}
       LIMIT 1`,
      [...scope.params, grantId],
    );
    if (!existing.rows[0]) throw new NotFoundException('Access grant not found');

    const granteeId = parseTenantUserId(existing.rows[0].grantee_user_id);
    const targetIds = this.normalizeTargetIds(body.target_user_ids);
    if (!targetIds.length) {
      throw new BadRequestException('Select at least one employee to grant access to');
    }
    if (targetIds.includes(granteeId)) {
      throw new BadRequestException('A user cannot be granted access to themselves via this form');
    }

    const wsId = parseWorkspaceId(admin.organization_id);
    if (wsId) await this.assertUsersInWorkspace(wsId, targetIds);

    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM time_doctor.access_grant_targets WHERE grant_id = $1`, [
        grantId,
      ]);
      for (const targetId of targetIds) {
        await client.query(
          `INSERT INTO time_doctor.access_grant_targets (grant_id, target_user_id)
           VALUES ($1, $2)`,
          [grantId, targetId],
        );
      }
      await client.query(
        `UPDATE time_doctor.access_grants SET updated_at = NOW() WHERE id = $1`,
        [grantId],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    const all = await this.listGrants(admin);
    const updated = all.find((g) => g.id === grantId);
    if (!updated) throw new NotFoundException('Access grant not found');
    return updated;
  }

  async deleteGrant(admin: ScopedAuthUser, grantId: number): Promise<{ deleted: boolean }> {
    const scope = workspaceScope(admin, 'g');
    const result = await this.db.query(
      `DELETE FROM time_doctor.access_grants g
       WHERE ${scope.clause}
         AND g.id = $${scope.params.length + 1}
       RETURNING g.id`,
      [...scope.params, grantId],
    );
    return { deleted: Boolean(result.rows[0]) };
  }

  private normalizeTargetIds(raw: string[]): number[] {
    const unique = new Set<number>();
    for (const id of raw || []) {
      unique.add(parseTenantUserId(id));
    }
    return [...unique];
  }

  private async assertUsersInWorkspace(workspaceId: number, userIds: number[]): Promise<void> {
    const result = await this.db.query<{ id: string }>(
      `${EMPLOYEE_USER_SELECT}
       WHERE ext.workspace_id = $1
         AND u.id = ANY($2::int[])`,
      [workspaceId, userIds],
    );
    if (result.rows.length !== userIds.length) {
      throw new BadRequestException(
        'One or more selected users are not in your organization',
      );
    }
  }
}
