import { supabase } from '@/integrations/supabase/client';

export interface SalarySettingRow {
  id: string;
  user_id: string;
  hourly_rate?: number | null;
  monthly_salary?: number | null;
  currency?: string | null;
  payment_type?: string | null;
  users?: { full_name: string; email?: string } | null;
}

export interface PayrollRow {
  id: string;
  user_id: string;
  month_year: string;
  total_hours?: number | null;
  total_amount?: number | null;
  status?: string | null;
  notes?: string | null;
  users?: { full_name: string; email?: string } | null;
}

interface OrgContext {
  organizationId?: string | null;
  isSuperAdmin?: boolean;
  orgUserIds?: string[];
}

export async function fetchSalarySettings(ctx: OrgContext): Promise<SalarySettingRow[]> {
  let query = supabase
    .from('employee_salary_settings')
    .select('*, users(full_name, email)');

  const { data, error } = await query;
  if (error) throw error;

  let rows = (data || []) as SalarySettingRow[];

  if (ctx.organizationId && !ctx.isSuperAdmin && ctx.orgUserIds?.length) {
    const ids = new Set(ctx.orgUserIds);
    rows = rows.filter((r) => ids.has(r.user_id));
  }

  return rows;
}

export async function fetchPayroll(
  monthYear: string,
  ctx: OrgContext
): Promise<PayrollRow[]> {
  let query = supabase
    .from('employee_payroll')
    .select('*, users(full_name, email)')
    .eq('month_year', monthYear);

  const { data, error } = await query;
  if (error) throw error;

  let rows = (data || []) as PayrollRow[];

  if (ctx.organizationId && !ctx.isSuperAdmin && ctx.orgUserIds?.length) {
    const ids = new Set(ctx.orgUserIds);
    rows = rows.filter((r) => ids.has(r.user_id));
  }

  return rows;
}

export async function upsertPayroll(records: Record<string, unknown>[]): Promise<void> {
  const { error } = await supabase.from('employee_payroll').upsert(records as any);
  if (error) throw error;
}

export async function updatePayrollRecord(
  id: string,
  updates: Partial<PayrollRow>
): Promise<void> {
  const { error } = await supabase
    .from('employee_payroll')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}
