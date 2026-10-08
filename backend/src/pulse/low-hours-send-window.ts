import {
  addCalendarDays,
  mondayKey,
  resolveMonthWeekCheckpoint,
  weekHomeMonth,
} from '../lib/paused-roster';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type LowHoursSendPeriod = 'pace' | 'week' | 'day';

export type LowHoursSendWindow = {
  periodStart: string;
  periodEnd: string;
  weekStart: string;
  weekEnd: string;
  weekIndex: number;
  month: string;
  expectedHours: number;
};

function requireDate(value: string | null | undefined, label: string): string {
  const key = String(value || '').trim();
  if (!DATE.test(key)) {
    throw new Error(`${label} is required (YYYY-MM-DD)`);
  }
  return key;
}

export function isWeekdayKey(dateKey: string): boolean {
  const [y, m, d] = String(dateKey || '')
    .split('-')
    .map((n) => parseInt(n, 10));
  if (!y || !m || !d) return false;
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return dow >= 1 && dow <= 5;
}

export function resolveLowHoursSendWindow(opts: {
  period: LowHoursSendPeriod;
  month?: string | null;
  weekIndex?: number | string | null;
  weekStart?: string | null;
  date?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  hoursThreshold?: number | string | null;
  todayKey: string;
  mondays: string[];
  defaultDailyThreshold: number;
}): LowHoursSendWindow {
  const todayKey = requireDate(opts.todayKey, 'today');
  const rawThreshold = Number(opts.hoursThreshold);
  const hoursThreshold =
    Number.isFinite(rawThreshold) && rawThreshold > 0 ? rawThreshold : undefined;

  if (opts.period === 'day') {
    const date = requireDate(opts.date || opts.weekStart, 'date');
    return {
      periodStart: date,
      periodEnd: date,
      weekStart: date,
      weekEnd: date,
      weekIndex: 1,
      month: date.slice(0, 7),
      expectedHours: hoursThreshold ?? opts.defaultDailyThreshold,
    };
  }

  if (opts.period === 'week') {
    let monday = String(opts.weekStart || opts.date || '').trim();
    if (DATE.test(monday)) {
      monday = mondayKey(monday);
    } else {
      const weekIndex = Math.max(1, Math.round(Number(opts.weekIndex) || 1));
      monday = opts.mondays[weekIndex - 1] || '';
    }
    if (!DATE.test(monday)) {
      throw new Error('week_start/date or month + week_index is required for week');
    }
    const friday = addCalendarDays(monday, 4);
    const periodEnd = friday > todayKey ? todayKey : friday;
    const weekIndexRaw = Number(opts.weekIndex);
    const weekIndex =
      Number.isFinite(weekIndexRaw) && weekIndexRaw >= 1
        ? Math.round(weekIndexRaw)
        : Math.max(1, opts.mondays.indexOf(monday) + 1);
    return {
      periodStart: monday,
      periodEnd: periodEnd < monday ? monday : periodEnd,
      weekStart: monday,
      weekEnd: friday,
      weekIndex,
      month: String(opts.month || monday.slice(0, 7)),
      expectedHours: hoursThreshold ?? 40,
    };
  }

  const explicitStart = DATE.test(String(opts.periodStart || '').trim())
    ? String(opts.periodStart).trim()
    : '';
  const explicitEnd = DATE.test(String(opts.periodEnd || '').trim())
    ? String(opts.periodEnd).trim()
    : '';
  const resolved = resolveMonthWeekCheckpoint({
    mondays: opts.mondays,
    weekIndex: Number(opts.weekIndex),
    weekStart: opts.weekStart,
    todayKey,
  });
  if (!resolved.checkpointMonday && !explicitStart) {
    throw new Error('month or week_start is required for pace');
  }
  const weekEnd = addCalendarDays(resolved.checkpointMonday || explicitStart, 4);
  let periodStart = explicitStart || resolved.periodStart;
  let periodEnd = explicitEnd || (weekEnd > todayKey ? todayKey : weekEnd);
  if (periodEnd > todayKey) periodEnd = todayKey;
  if (periodEnd < periodStart) periodEnd = periodStart;
  return {
    periodStart,
    periodEnd,
    weekStart: resolved.checkpointMonday || periodStart,
    weekEnd,
    weekIndex: resolved.weekIndex || 1,
    month: String(opts.month || weekHomeMonth(resolved.checkpointMonday || periodStart)),
    expectedHours: hoursThreshold ?? resolved.weekIndex * 35,
  };
}

export type DailyHoursEmployee = {
  employee_id: string | number;
  full_name?: string | null;
  email?: string | null;
  manager_email?: string | null;
  department?: string | null;
  days?: Array<{
    date: string;
    hours_worked?: number;
    low_activity_hours?: number;
    idle_hours?: number;
    non_effective_hours?: number;
    effective_hours?: number;
  }>;
};

export function mailTargetFromDailyEmployee(
  emp: DailyHoursEmployee,
  expectedHours: number,
  start: string,
  end: string,
) {
  const days = (emp.days || []).filter(
    (day) => day?.date >= start && day?.date <= end && isWeekdayKey(day.date),
  );
  const daily_hours: Record<string, number> = {};
  const daily_low_activity: Record<string, number> = {};
  const daily_idle: Record<string, number> = {};
  let hours = 0;
  let nonEffective = 0;
  let effective = 0;
  for (const day of days) {
    const worked = Number(day.hours_worked || 0);
    hours += worked;
    daily_hours[day.date] = worked;
    daily_low_activity[day.date] = Number(day.low_activity_hours || 0);
    daily_idle[day.date] = Number(day.idle_hours || 0);
    nonEffective += Number(day.non_effective_hours || 0);
    effective += Number(day.effective_hours || 0);
  }
  hours = Math.round(hours * 10) / 10;
  return {
    employee_id: String(emp.employee_id),
    full_name: emp.full_name,
    email: emp.email,
    department: emp.department ?? null,
    manager_email: emp.manager_email ?? null,
    hours_worked: hours,
    expected_hours: expectedHours,
    non_effective_hours: Math.round(nonEffective * 10) / 10,
    effective_hours: Math.round(effective * 10) / 10,
    daily_hours,
    daily_low_activity,
    daily_idle,
    day_keys: days.map((day) => day.date),
  };
}

export function employeesFromSendSnapshot(
  raw: unknown,
  selectedIds: string[],
): DailyHoursEmployee[] {
  const idSet = new Set(selectedIds.map(String));
  if (!Array.isArray(raw) || !idSet.size) return [];
  return raw.flatMap((row): DailyHoursEmployee[] => {
    const emp = row as DailyHoursEmployee;
    const id = String(emp?.employee_id || '');
    if (!idSet.has(id)) return [];
    const days = Array.isArray(emp.days)
      ? emp.days.filter((day) => DATE.test(String(day?.date || '')))
      : [];
    return [
      {
        employee_id: id,
        full_name: emp.full_name ?? null,
        email: emp.email ?? null,
        manager_email: emp.manager_email ?? null,
        department: emp.department ?? null,
        days,
      },
    ];
  });
}
