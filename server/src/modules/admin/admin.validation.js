const { HttpError } = require('../../errors');
const { ALL_ROLES } = require('../users/roles');
const { validateRegistration } = require('../users/users.validation');

const SEARCH_MAX = 100;

function fail(fields) {
  throw new HttpError(400, 'Please correct the highlighted fields', fields);
}

// GET /api/admin/users?role=driver&search=ravi. Empty values mean "no filter".
function validateUserFilter(query = {}) {
  const role = typeof query.role === 'string' ? query.role.trim() : '';
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const fields = {};

  if (role && !ALL_ROLES.includes(role)) fields.role = 'Choose driver, attendant or admin';
  if (search.length > SEARCH_MAX) fields.search = `Search must be at most ${SEARCH_MAX} characters`;

  if (Object.keys(fields).length > 0) fail(fields);
  return { role, search };
}

// An admin adds an account of any role (UT-12_02). Name, email and password follow the
// same rules as registration; the role must be one of the three from the SRS.
function validateNewUser(body = {}) {
  let details = {};
  let fields = {};
  try {
    details = validateRegistration(body);
  } catch (err) {
    if (!err.fields) throw err;
    fields = { ...err.fields };
  }

  const role = typeof body.role === 'string' ? body.role.trim() : '';
  if (!role) fields.role = 'Role is required';
  else if (!ALL_ROLES.includes(role)) fields.role = 'Choose driver, attendant or admin';

  if (Object.keys(fields).length > 0) fail(fields);
  return { ...details, role };
}

// Route ids must be whole numbers: MySQL would quietly read "1abc" as 1.
function parseId(value, notFoundMessage) {
  if (!/^[1-9]\d{0,9}$/.test(value)) throw new HttpError(404, notFoundMessage);
  return Number(value);
}

module.exports = { validateUserFilter, validateNewUser, parseId };
