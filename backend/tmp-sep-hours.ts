import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { PulseService } from './src/pulse/pulse.service';
import { computeEffectiveTime } from './src/lib/effective-time';
import { formatDecimalHours } from './src/pulse/format-hours';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const pulse = app.get(PulseService);
    const data = await pulse.getDailyHours(
      { id: '1', role: 'admin', organization_id: '511' },
      '2026-09-01',
      '2026-09-30',
    );
    const rows = data.employees
      .map((emp) => {
        let total = 0;
        let nonEffective = 0;
        let effective = 0;
        for (const day of emp.days) {
          total += day.hours_worked;
          const eff = computeEffectiveTime(
            day.hours_worked,
            day.low_activity_hours,
            day.idle_hours,
          );
          nonEffective += eff.non_effective_hours;
          effective += eff.effective_hours;
        }
        return {
          name: emp.full_name || emp.email,
          email: emp.email,
          total,
          effective,
          nonEffective,
        };
      })
      .filter((row) => row.total > 0 || row.effective > 0 || row.nonEffective > 0)
      .sort((a, b) => b.total - a.total);

    const sum = rows.reduce(
      (acc, row) => {
        acc.total += row.total;
        acc.effective += row.effective;
        acc.nonEffective += row.nonEffective;
        return acc;
      },
      { total: 0, effective: 0, nonEffective: 0 },
    );

    const fmt = (n: number) => formatDecimalHours(Math.round(n * 10) / 10, { emptyLabel: '0 min' });
    console.log(
      JSON.stringify(
        {
          timezone: data.timezone,
          start: data.start,
          end: data.end,
          employees: rows.map((row) => ({
            name: row.name,
            email: row.email,
            total: fmt(row.total),
            effective: fmt(row.effective),
            nonEffective: fmt(row.nonEffective),
            totalHours: Math.round(row.total * 10) / 10,
            effectiveHours: Math.round(row.effective * 10) / 10,
            nonEffectiveHours: Math.round(row.nonEffective * 10) / 10,
          })),
          totals: {
            total: fmt(sum.total),
            effective: fmt(sum.effective),
            nonEffective: fmt(sum.nonEffective),
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
