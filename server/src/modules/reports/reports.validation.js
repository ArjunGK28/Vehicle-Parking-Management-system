const { HttpError } = require('../../errors');

const MAX_DAYS = 366;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// A real calendar date as 'YYYY-MM-DD', or null (2026-02-30 is not one).
function cleanDate(value) {
  const match = typeof value === 'string' ? DATE_PATTERN.exec(value.trim()) : null;
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const isReal = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  return isReal ? match[0] : null;
}

const dayNumber = (text) => Date.parse(`${text}T00:00:00Z`) / 86400000;

// GET /api/reports/occupancy?from=2026-10-01&to=2026-10-29 (both days included).
function validateRange(query = {}) {
  const from = cleanDate(query.from);
  const to = cleanDate(query.to);
  const fields = {};

  if (!from) fields.from = 'Enter the start date as YYYY-MM-DD';
  if (!to) fields.to = 'Enter the end date as YYYY-MM-DD';
  if (from && to) {
    const days = dayNumber(to) - dayNumber(from) + 1;
    if (days < 1) fields.to = 'The end date must be on or after the start date';
    else if (days > MAX_DAYS) fields.to = `Choose a range of at most ${MAX_DAYS} days`;
  }

  if (Object.keys(fields).length > 0) {
    throw new HttpError(400, 'Please correct the highlighted fields', fields);
  }
  return { from, to };
}

// Every date from 'from' to 'to', inclusive.
function datesBetween(from, to) {
  const dates = [];
  for (let n = dayNumber(from); n <= dayNumber(to); n += 1) {
    dates.push(new Date(n * 86400000).toISOString().slice(0, 10));
  }
  return dates;
}

module.exports = { validateRange, datesBetween };
