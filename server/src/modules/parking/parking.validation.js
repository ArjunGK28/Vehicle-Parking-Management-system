const { HttpError } = require('../../errors');
const { normaliseRegistration, isValidRegistration } = require('../vehicles/vehicles.validation');

function fail(message) {
  throw new HttpError(400, message, { registrationNumber: message });
}

// Returns the registration number normalised the same way vehicles store it
// ("ka 01 ab-1234" -> "KA01AB1234"), or throws a 400.
// Non-text values (such as a repeated ?registrationNumber=a&registrationNumber=b) count as invalid.
function cleanRegistration(raw) {
  const registrationNumber = normaliseRegistration(raw);

  if (!registrationNumber) {
    fail(raw === undefined || typeof raw === 'string' ? 'Enter a registration number' : 'Enter a valid registration number');
  }
  if (!isValidRegistration(registrationNumber)) fail('Enter a valid registration number');
  return registrationNumber;
}

// FR-07: returns clean { registrationNumber } or throws a 400.
function validateLocateQuery(query = {}) {
  return { registrationNumber: cleanRegistration(query.registrationNumber) };
}

module.exports = { validateLocateQuery, cleanRegistration };
