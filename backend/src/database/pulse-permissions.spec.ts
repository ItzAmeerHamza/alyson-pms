import { describe, expect, it } from 'vitest';
import {
  canAccessPulseTeamReports,
  canAdjustPulseTime,
  canManagePulseUsers,
} from './time-doctor-sql';

const admin = { id: '1', role: 'admin', organization_id: '10' };
const manager = { id: '2', role: 'manager', organization_id: '10' };
const teamLead = { id: '3', role: 'team_leader', organization_id: '10' };
const employee = { id: '4', role: 'employee', organization_id: '10' };
const superAdmin = { id: '9', role: 'employee', is_super_admin: true };

describe('Pulse role gates (HR / money paths)', () => {
  it('only admin (or super-admin) may adjust time', () => {
    expect(canAdjustPulseTime(admin)).toBe(true);
    expect(canAdjustPulseTime(superAdmin)).toBe(true);
    expect(canAdjustPulseTime(manager)).toBe(false);
    expect(canAdjustPulseTime(teamLead)).toBe(false);
    expect(canAdjustPulseTime(employee)).toBe(false);
  });

  it('only admin (or super-admin) may open org team reports', () => {
    expect(canAccessPulseTeamReports(admin)).toBe(true);
    expect(canAccessPulseTeamReports(superAdmin)).toBe(true);
    expect(canAccessPulseTeamReports(manager)).toBe(false);
    expect(canAccessPulseTeamReports(teamLead)).toBe(false);
    expect(canAccessPulseTeamReports(employee)).toBe(false);
  });

  it('admin and manager may invite / assign projects; others may not', () => {
    expect(canManagePulseUsers(admin)).toBe(true);
    expect(canManagePulseUsers(manager)).toBe(true);
    expect(canManagePulseUsers(superAdmin)).toBe(true);
    expect(canManagePulseUsers(teamLead)).toBe(false);
    expect(canManagePulseUsers(employee)).toBe(false);
  });
});
