/**
 * Turn decimal hours (e.g. 1.666) into a readable label (e.g. "1 hour 40 min").
 * Shared by Pulse email templates and digests.
 */
export function formatDecimalHours(
  hours: unknown,
  { emptyLabel = '—' }: { emptyLabel?: string } = {},
): string {
  const value = Number(hours);
  if (!Number.isFinite(value)) return emptyLabel;

  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  // Treat sub-minute noise as empty.
  if (abs < 1 / 120) return emptyLabel;

  let wholeHours = Math.floor(abs);
  let minutes = Math.round((abs - wholeHours) * 60);

  if (minutes >= 60) {
    wholeHours += 1;
    minutes = 0;
  }

  const hourPart =
    wholeHours === 0
      ? null
      : `${wholeHours} ${wholeHours === 1 ? 'hour' : 'hours'}`;
  const minPart = minutes === 0 ? null : `${minutes} min`;

  if (!hourPart && !minPart) return emptyLabel;
  if (!hourPart) return `${sign}${minPart}`;
  if (!minPart) return `${sign}${hourPart}`;
  return `${sign}${hourPart} ${minPart}`;
}
