const { HttpError } = require('../../errors');
const { ALL_SLOT_TYPES } = require('./slotTypes');
const { ALL_SLOT_STATUSES } = require('./slotStatuses');

// Letters and digits in hyphen-separated groups, e.g. P-30 (Test Plan IT_35)
const CODE_PATTERN = /^[A-Z0-9]+(-[A-Z0-9]+)*$/;
const CODE_MAX = 10;

function asText(value) {
  return typeof value === 'string' ? value : '';
}

function fail(fields) {
  throw new HttpError(400, 'Please correct the highlighted fields', fields);
}

// Returns clean { code, type } or throws a 400 with per-field messages.
function validateNewSlot(body = {}) {
  const code = asText(body.code).trim().toUpperCase();
  const type = asText(body.type).trim();
  const fields = {};

  if (!code) fields.code = 'Slot code is required';
  else if (code.length > CODE_MAX || !CODE_PATTERN.test(code)) {
    fields.code = 'Use up to 10 letters, digits and hyphens, e.g. P-30';
  }

  if (!type) fields.type = 'Slot type is required';
  else if (!ALL_SLOT_TYPES.includes(type)) fields.type = 'Choose two-wheeler or four-wheeler';

  if (Object.keys(fields).length > 0) fail(fields);
  return { code, type };
}

// Disabling and re-enabling is the only change an admin makes to an existing slot.
function validateSlotUpdate(body = {}) {
  if (typeof body.disabled !== 'boolean') fail({ disabled: 'Must be true or false' });
  return { disabled: body.disabled };
}

// FR-03: optional ?status= and ?type= filters on the slot list. A missing or empty
// value means "no filter"; anything else must be a known value.
function validateSlotFilter(query = {}) {
  const status = query.status === undefined || query.status === '' ? null : query.status;
  const type = query.type === undefined || query.type === '' ? null : query.type;
  const fields = {};

  if (status !== null && !ALL_SLOT_STATUSES.includes(status)) {
    fields.status = 'Choose available, occupied, reserved or unavailable';
  }
  if (type !== null && !ALL_SLOT_TYPES.includes(type)) {
    fields.type = 'Choose two-wheeler or four-wheeler';
  }

  if (Object.keys(fields).length > 0) fail(fields);
  return { status, type };
}

// Route ids must be whole numbers: MySQL would quietly read "1abc" as 1.
function parseSlotId(value) {
  if (!/^[1-9]\d{0,9}$/.test(value)) throw new HttpError(404, 'Slot not found');
  return Number(value);
}

module.exports = { validateNewSlot, validateSlotUpdate, validateSlotFilter, parseSlotId };