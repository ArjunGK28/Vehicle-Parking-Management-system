const { HttpError } = require('../../errors');

// local@domain.tld: rejects "abc@com" (Test Plan IT_03)
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 6;
const PASSWORD_MAX_BYTES = 72; // bcrypt ignores anything longer

function asText(value) {
  return typeof value === 'string' ? value : '';
}

function checkEmail(email) {
  if (!email) return 'Email is required';
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return 'Enter a valid email address';
  return null;
}

function fail(fields) {
  throw new HttpError(400, 'Please correct the highlighted fields', fields);
}

// Returns clean { name, email, password } or throws a 400 with per-field messages.
function validateRegistration(body = {}) {
  const name = asText(body.name).trim();
  const email = asText(body.email).trim().toLowerCase();
  const password = asText(body.password);
  const fields = {};

  if (!name) fields.name = 'Name is required';
  else if (name.length < 2 || name.length > 100) fields.name = 'Name must be 2 to 100 characters';

  const emailError = checkEmail(email);
  if (emailError) fields.email = emailError;

  if (!password) fields.password = 'Password is required';
  else if (password.length < PASSWORD_MIN) fields.password = `Password must be at least ${PASSWORD_MIN} characters`;
  else if (Buffer.byteLength(password) > PASSWORD_MAX_BYTES) fields.password = 'Password is too long';

  if (Object.keys(fields).length > 0) fail(fields);
  return { name, email, password };
}

// Login only checks presence and shape; whether the credentials are right is the service's job.
function validateLogin(body = {}) {
  const email = asText(body.email).trim().toLowerCase();
  const password = asText(body.password);
  const fields = {};

  const emailError = checkEmail(email);
  if (emailError) fields.email = emailError;
  if (!password) fields.password = 'Password is required';

  if (Object.keys(fields).length > 0) fail(fields);
  return { email, password };
}

module.exports = { validateRegistration, validateLogin };
