/**
 * Month-at-a-Glance navigation. Keep the painted month and its payload
 * in lockstep so prev/next cannot flash another month's totals.
 */

function resolveMonthOffset(monthOffset) {
  const parsed = Number(monthOffset);
  return Number.isFinite(parsed) ? Math.min(0, Math.max(-24, Math.trunc(parsed))) : 0;
}

function monthLabelForOffset(monthOffset = 0, now = new Date()) {
  const { workMonthBounds, getWorkTimezone } = require('./work-timezone');
  const offset = resolveMonthOffset(monthOffset);
  const currentMonth = workMonthBounds(now);
  let year = currentMonth.year;
  let month = currentMonth.month + offset;
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  const monthRefDate = new Date(Date.UTC(year, month - 1, 15, 12, 0, 0));
  const { startMs } = workMonthBounds(monthRefDate);
  return new Date(startMs).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: getWorkTimezone(),
  });
}

function reportMatchesViewedMonth(reportData, viewedOffset) {
  if (!reportData || reportData.error) return false;
  if (typeof reportData.monthOffset === 'number') {
    return reportData.monthOffset === resolveMonthOffset(viewedOffset);
  }
  return true;
}

function shouldPaintLiveTodayOntoMonthlyReport(viewedOffset) {
  return resolveMonthOffset(viewedOffset) === 0;
}

module.exports = {
  resolveMonthOffset,
  monthLabelForOffset,
  reportMatchesViewedMonth,
  shouldPaintLiveTodayOntoMonthlyReport,
};
