export interface DailyEffectiveInput {
  idleSeconds: number;
  lowActivitySeconds: number;
}

/** Flatten per-user hour maps into per-day seconds for the desktop month card. */
export function dailyEffectiveInputsFromHourMaps(
  userId: string,
  idleByUserDay: Map<string, Map<string, number>>,
  lowByUserDay: Map<string, Map<string, number>>,
): Record<string, DailyEffectiveInput> {
  const idleDay = idleByUserDay.get(userId) ?? new Map();
  const lowDay = lowByUserDay.get(userId) ?? new Map();
  const daily: Record<string, DailyEffectiveInput> = {};
  for (const day of new Set([...idleDay.keys(), ...lowDay.keys()])) {
    daily[day] = {
      idleSeconds: Math.max(0, Math.round((idleDay.get(day) ?? 0) * 3600)),
      lowActivitySeconds: Math.max(0, Math.round((lowDay.get(day) ?? 0) * 3600)),
    };
  }
  return daily;
}
