const { HttpError } = require('../../errors');
const { ALL_SLOT_TYPES } = require('../slots/slotTypes');

const MAX_AMOUNT = 10000; // rupees
const BILLING_STEPS = Object.freeze([15, 30, 60]); // minutes

// Accepts 25 or "25"; anything else (25.5, "", "2e1", -3) gives null.
function asWholeNumber(value) {
  if (Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d{1,6}$/.test(value.trim())) return Number(value);
  return null;
}

function checkAmount(value, label, min) {
  if (value === undefined || value === null || value === '') return `${label} is required`;
  const amount = asWholeNumber(value);
  if (amount === null || amount < min || amount > MAX_AMOUNT) {
    return `${label} must be a whole number of rupees from ${min} to ${MAX_AMOUNT}`;
  }
  return null;
}

// Returns clean { hourlyRate, minimumFee, billingStepMinutes } or throws a 400 with per-field messages.
function validateRate(body = {}) {
  const fields = {};

  const hourlyError = checkAmount(body.hourlyRate, 'Hourly rate', 1);
  if (hourlyError) fields.hourlyRate = hourlyError;

  const minimumError = checkAmount(body.minimumFee, 'Minimum fee', 0);
  if (minimumError) fields.minimumFee = minimumError;

  const step = asWholeNumber(body.billingStepMinutes);
  if (!BILLING_STEPS.includes(step)) {
    fields.billingStepMinutes = `Billing step must be ${BILLING_STEPS.join(', ')} minutes`;
  }

  if (Object.keys(fields).length > 0) {
    throw new HttpError(400, 'Please correct the highlighted fields', fields);
  }
  return {
    hourlyRate: asWholeNumber(body.hourlyRate),
    minimumFee: asWholeNumber(body.minimumFee),
    billingStepMinutes: step,
  };
}

// The route's :type must be a known slot type.
function parseSlotType(value) {
  if (!ALL_SLOT_TYPES.includes(value)) throw new HttpError(404, 'No rate for that vehicle type');
  return value;
}

module.exports = { validateRate, parseSlotType, BILLING_STEPS };
