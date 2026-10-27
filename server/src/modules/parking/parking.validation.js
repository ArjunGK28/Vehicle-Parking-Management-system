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

// "2026-10-27 15:00", "2026-10-27T15:00" or "2026-10-27 15:00:30" (the attendant's local time).
const EXIT_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

// Returns "YYYY-MM-DD HH:MM:SS" for a real date and time, or null (2026-02-30 is not one).
function cleanExitTime(raw) {
  const match = typeof raw === 'string' ? EXIT_TIME_PATTERN.exec(raw.trim()) : null;
  if (!match) return null;

  const [year, month, day, hour, minute, second = '00'] = match.slice(1);
  const date = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second));
  const isReal = date.getUTCFullYear() === +year
    && date.getUTCMonth() === +month - 1
    && date.getUTCDate() === +day
    && date.getUTCHours() === +hour
    && date.getUTCMinutes() === +minute
    && date.getUTCSeconds() === +second;

  return isReal ? `${year}-${month}-${day} ${hour}:${minute}:${second}` : null;
}

// FR-08: returns clean { registrationNumber, exitTime } or throws a 400.
// exitTime is optional; null means "now", which MySQL fills in.
function validateExit(body = {}) {
  const registrationNumber = cleanRegistration(body.registrationNumber);

  if (body.exitTime === undefined || body.exitTime === null || body.exitTime === '') {
    return { registrationNumber, exitTime: null };
  }

  const exitTime = cleanExitTime(body.exitTime);
  if (!exitTime) {
    throw new HttpError(400, 'Please correct the highlighted fields', {
      exitTime: 'Enter the exit time as YYYY-MM-DD HH:MM',
    });
  }
  return { registrationNumber, exitTime };
}

module.exports = { validateLocateQuery, cleanRegistration, validateExit };
