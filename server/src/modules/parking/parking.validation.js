const { HttpError } = require('../../errors');

const REGISTRATION_MAX = 20;
// Same characters the vehicle registration form accepts (vehicles.validation.js).
const REGISTRATION_PATTERN = /^[A-Z0-9 -]+$/;

function fail(message) {
  throw new HttpError(400, message, { registrationNumber: message });
}

// FR-07: returns clean { registrationNumber } (trimmed, upper case) or throws a 400.
// Non-text values (such as a repeated ?registrationNumber=a&registrationNumber=b) count as invalid.
function validateLocateQuery(query = {}) {
  const raw = query.registrationNumber;
  const registrationNumber = typeof raw === 'string' ? raw.trim().toUpperCase() : '';

  if (!registrationNumber) {
    fail(raw === undefined || raw === '' || typeof raw === 'string' ? 'Enter a registration number' : 'Enter a valid registration number');
  }
  if (registrationNumber.length > REGISTRATION_MAX || !REGISTRATION_PATTERN.test(registrationNumber)) {
    fail('Enter a valid registration number');
  }
  return { registrationNumber };
}

module.exports = { validateLocateQuery };