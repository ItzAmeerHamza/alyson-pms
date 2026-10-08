import { describe, expect, it } from 'vitest';
import {
  applyPulseWorkspaceContext,
  canAccessPulseTeamReports,
  canAdjustPulseTime,
  canManagePulseUsers,
  hoursGoalRosterSql,
  isPulseOrgAdmin,
  isPulsePlatformAdmin,
  pulseTenantForbiddenMessage,
  pulseWorkspaceFromRequest,
  workspaceScope,
} from './time-doctor-sql';

const admin = { id: '1', role: 'admin', organization_id: '10' };
const manager = { id: '2', role: 'manager', organization_id: '10' };
const teamLead = { id: '3', role: 'team_leader', organization_id: '10' };
const employee = { id: '4', role: 'employee', organization_id: '10' };
const superAdmin = { id: '9', role: 'employee', is_super_admin: true };
const superInCompany = {
  id: '9',
  role: 'employee',
  is_super_admin: true,
  organization_id: '10',
};

describe('Pulse role gates (HR / money paths)', () => {
  it('only admin (or super-admin in a selected company) may adjust time', () => {
    expect(canAdjustPulseTime(admin)).toBe(true);
    expect(canAdjustPulseTime(superInCompany)).toBe(true);
    expect(canAdjustPulseTime(superAdmin)).toBe(false);
    expect(canAdjustPulseTime(manager)).toBe(false);
    expect(canAdjustPulseTime(teamLead)).toBe(false);
    expect(canAdjustPulseTime(employee)).toBe(false);
  });

  it('only admin (or super-admin in a selected company) may open org team reports', () => {
    expect(canAccessPulseTeamReports(admin)).toBe(true);
    expect(canAccessPulseTeamReports(superInCompany)).toBe(true);
    expect(canAccessPulseTeamReports(superAdmin)).toBe(false);
    expect(canAccessPulseTeamReports(manager)).toBe(false);
    expect(canAccessPulseTeamReports(teamLead)).toBe(false);
    expect(canAccessPulseTeamReports(employee)).toBe(false);
  });

  it('admin and manager may invite / assign projects; others may not', () => {
    expect(canManagePulseUsers(admin)).toBe(true);
    expect(canManagePulseUsers(manager)).toBe(true);
    expect(canManagePulseUsers(superInCompany)).toBe(true);
    expect(canManagePulseUsers(superAdmin)).toBe(false);
    expect(canManagePulseUsers(teamLead)).toBe(false);
    expect(canManagePulseUsers(employee)).toBe(false);
  });

  it('treats super-admin as platform admin even without a company', () => {
    expect(isPulsePlatformAdmin(superAdmin)).toBe(true);
    expect(isPulseOrgAdmin(superAdmin)).toBe(false);
    expect(isPulseOrgAdmin(superInCompany)).toBe(true);
    expect(pulseTenantForbiddenMessage(superAdmin)).toBe('Select a company');
    expect(pulseTenantForbiddenMessage(superInCompany)).toBeNull();
    expect(pulseTenantForbiddenMessage(admin)).toBeNull();
  });
});

describe('workspaceScope', () => {
  it('scopes company admins to their workspace', () => {
    expect(workspaceScope(admin, 'ext')).toEqual({
      clause: 'ext.workspace_id = $1',
      params: [10],
    });
  });

  it('is fail-closed when organization_id is missing', () => {
    expect(workspaceScope({ id: '1', role: 'admin' }, 'ext')).toEqual({
      clause: '1=0',
      params: [],
    });
  });

  it('does not dump all tenants for a super-admin without a selected company', () => {
    expect(workspaceScope(superAdmin, 'ext')).toEqual({
      clause: '1=0',
      params: [],
    });
  });

  it('scopes a super-admin to the selected company', () => {
    expect(workspaceScope(superInCompany, 'ext')).toEqual({
      clause: 'ext.workspace_id = $1',
      params: [10],
    });
  });
});

describe('applyPulseWorkspaceContext', () => {
  it('ignores the header for company admins', () => {
    expect(applyPulseWorkspaceContext(admin, '99').organization_id).toBe('10');
  });

  it('overlays the selected company for super-admins', () => {
    expect(applyPulseWorkspaceContext(superAdmin, '99').organization_id).toBe('99');
  });

  it('clears organization_id when a super-admin has no header', () => {
    expect(
      applyPulseWorkspaceContext(
        { ...superAdmin, organization_id: '511' },
        undefined,
      ).organization_id,
    ).toBeNull();
  });

  it('reads pulseWorkspaceId from the query when the header is missing', () => {
    expect(pulseWorkspaceFromRequest({}, { pulseWorkspaceId: '511' })).toBe('511');
    expect(
      pulseWorkspaceFromRequest({ 'x-pulse-workspace-id': '10' }, { pulseWorkspaceId: '511' }),
    ).toBe('10');
  });
});

describe('hoursGoalRosterSql', () => {
  it('omits team hours-goal filters when looking up one user', () => {
    expect(hoursGoalRosterSql('1195')).toEqual([]);
    expect(hoursGoalRosterSql('4').length).toBe(0);
  });

  it('keeps employee, team-lead, admin, and signed-in filters for the team grid', () => {
    expect(hoursGoalRosterSql()).toEqual([
      `coalesce(ext.pulse_role, 'employee') IN ('employee', 'team_leader', 'admin')`,
      `ext.signed_in_at IS NOT NULL`,
    ]);
    expect(hoursGoalRosterSql(null)).toHaveLength(2);
  });
});
