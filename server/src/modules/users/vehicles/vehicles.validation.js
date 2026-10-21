const { HttpError } = require('../../../errors');

function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateVehicle(body = {}) {
  const registrationNumber = asText(body.registrationNumber).toUpperCase();
  const type = asText(body.type);
  const model = asText(body.model);
  const colour = asText(body.colour);
  const fields = {};

  if (!registrationNumber) {
    fields.registrationNumber = 'Registration number is required';
  } else if (
    registrationNumber.length > 20 ||
    !/^[A-Z0-9 -]+$/.test(registrationNumber)
  ) {
    fields.registrationNumber = 'Enter a valid registration number';
  }

  if (!type) {
    fields.type = 'Vehicle type is required';
  } else if (type.length > 50) {
    fields.type = 'Vehicle type must not exceed 50 characters';
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

module.exports = { validateVehicle };
