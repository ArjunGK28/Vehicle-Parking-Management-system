const { HttpError } = require('../../errors');
const { ALL_AUDIT_ACTIONS } = require('./auditActions');

const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 100;

function wholeNumber(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return typeof value === 'string' && /^\d{1,6}$/.test(value) ? Number(value) : NaN;
}

// GET /api/audit?action=rate_changed&page=2&pageSize=25
function validateAuditQuery(query = {}) {
  const action = query.action === undefined || query.action === '' ? null : query.action;
  const page = wholeNumber(query.page, 1);
  const pageSize = wholeNumber(query.pageSize, PAGE_SIZE_DEFAULT);
  const fields = {};

  if (action !== null && !ALL_AUDIT_ACTIONS.includes(action)) fields.action = 'Choose one of the listed actions';
  if (!(page >= 1)) fields.page = 'Page must be 1 or more';
  if (!(pageSize >= 1 && pageSize <= PAGE_SIZE_MAX)) fields.pageSize = `Page size must be 1 to ${PAGE_SIZE_MAX}`;

  if (Object.keys(fields).length > 0) {
    throw new HttpError(400, 'Please correct the highlighted fields', fields);
  }
  return { action, page, pageSize };
}

module.exports = { validateAuditQuery };
