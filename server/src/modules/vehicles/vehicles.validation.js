const { HttpError } = require('../../errors');
const { ALL_SLOT_TYPES } = require('../slots/slotTypes');

// Stored without spaces or hyphens, so "KA 01 AB-1234" and "KA01AB1234" are the same
// vehicle and the unique key catches the duplicate (IT-02_03).
const REGISTRATION_PATTERN = /^[A-Z0-9]{4,15}$/;

function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// "ka 01 ab-1234" -> "KA01AB1234". Used wherever a registration number comes in:
// vehicle forms, entry, exit and locate.
function normaliseRegistration(value) {
  return typeof value === 'string' ? value.replace(/[\s-]/g, '').toUpperCase() : '';
}

// A real number has letters and digits, so "1234" is refused (IT-02_04).
function isValidRegistration(registrationNumber) {
  return REGISTRATION_PATTERN.test(registrationNumber)
    && /[A-Z]/.test(registrationNumber)
    && /[0-9]/.test(registrationNumber);
}

function validateVehicle(body = {}) {
  const registrationNumber = normaliseRegistration(body.registrationNumber);
  const type = asText(body.type);
  const model = asText(body.model);
  const colour = asText(body.colour);
  const fields = {};

  if (!registrationNumber) {
    fields.registrationNumber = 'Registration number is required';
  } else if (!isValidRegistration(registrationNumber)) {
    fields.registrationNumber = 'Enter a valid registration number';
  }

  // The type decides which slots the vehicle can use (DR-07), so it must be a slot type.
  if (!type) {
    fields.type = 'Vehicle type is required';
  } else if (!ALL_SLOT_TYPES.includes(type)) {
    fields.type = 'Choose two-wheeler or four-wheeler';
  }

  if (!model) {
    fields.model = 'Vehicle model is required';
  } else if (model.length > 100) {
    fields.model = 'Vehicle model must not exceed 100 characters';
  }

  if (!colour) {
    fields.colour = 'Vehicle colour is required';
  } else if (colour.length > 50) {
    fields.colour = 'Vehicle colour must not exceed 50 characters';
  }

  if (Object.keys(fields).length > 0) {
    throw new HttpError(
      400,
      'Please correct the highlighted fields',
      fields,
    );
  }

  return { registrationNumber, type, model, colour };
}

// Route ids must be whole numbers: MySQL would quietly read "1abc" as 1.
function parseVehicleId(value) {
  if (!/^[1-9]\d{0,9}$/.test(value)) throw new HttpError(404, 'Vehicle not found');
  return Number(value);
}

module.exports = { validateVehicle, normaliseRegistration, isValidRegistration, parseVehicleId };
