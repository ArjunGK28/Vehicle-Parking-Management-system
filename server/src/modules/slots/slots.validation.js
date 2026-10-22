const { HttpError } = require('../../errors');
const { ALL_SLOT_TYPES } = require('./slotTypes');

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

// Route ids must be whole numbers: MySQL would quietly read "1abc" as 1.
function parseSlotId(value) {
  if (!/^[1-9]\d{0,9}$/.test(value)) throw new HttpError(404, 'Slot not found');
  return Number(value);
}

module.exports = { validateNewSlot, validateSlotUpdate, parseSlotId };
