// --- 6. UTILITY: Timeframe Parser ---
// File: utils/timeframeParser.js

const { parseISO, subWeeks, subMonths, startOfQuarter } = require('date-fns');

function resolveTimeframe(timeframeLabel) {
  const today = new Date();

  if (!timeframeLabel) return null;
  const input = timeframeLabel.toLowerCase();

  if (input.includes('last 5 weeks')) return subWeeks(today, 5);
  if (input.includes('last 2 months')) return subMonths(today, 2);
  if (input.includes('this quarter')) return startOfQuarter(today);

  return null;
}
