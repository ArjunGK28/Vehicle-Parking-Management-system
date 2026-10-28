const { HttpError } = require('../../errors');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// Reads ?page= and ?pageSize= (FR-11). Missing or empty values use the defaults;
// anything else must be a whole number in range. Repeated parameters are refused.
function readWholeNumber(raw, fallback, min, max) {
  if (raw === undefined || raw === '') return { value: fallback };
  if (typeof raw !== 'string' || !/^\d{1,6}$/.test(raw)) return { error: true };
  const value = Number(raw);
  return value < min || value > max ? { error: true } : { value };
}

// Returns clean { page, pageSize } or throws a 400 with per-field messages.
function validatePageQuery(query = {}) {
  const page = readWholeNumber(query.page, 1, 1, 100000);
  const pageSize = readWholeNumber(query.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const fields = {};

  if (page.error) fields.page = 'Page must be a whole number from 1';
  if (pageSize.error) fields.pageSize = `Page size must be a whole number from 1 to ${MAX_PAGE_SIZE}`;

  if (Object.keys(fields).length > 0) {
    throw new HttpError(400, 'Please correct the highlighted fields', fields);
  }
  return { page: page.value, pageSize: pageSize.value };
}

module.exports = { validatePageQuery, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };