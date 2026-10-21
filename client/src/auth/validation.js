// Same rules as server/src/modules/users/users.validation.js, checked before submitting
// so the user gets instant feedback. The server still checks everything again.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;
const PASSWORD_MIN = 6;
const PASSWORD_MAX_BYTES = 72; // bcrypt ignores anything longer

function emailError(email) {
  const value = email.trim();
  if (!value) return 'Email is required';
  if (value.length > EMAIL_MAX || !EMAIL_PATTERN.test(value)) return 'Enter a valid email address';
  return null;
}

function passwordTooLong(password) {
  return new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES;
}

export function validateRegistration({ name, email, password }) {
  const fields = {};
  const trimmed = name.trim();
  if (!trimmed) fields.name = 'Name is required';
  else if (trimmed.length < 2 || trimmed.length > 100) fields.name = 'Name must be 2 to 100 characters';
  const e = emailError(email);
  if (e) fields.email = e;
  if (!password) fields.password = 'Password is required';
  else if (password.length < PASSWORD_MIN) fields.password = `Password must be at least ${PASSWORD_MIN} characters`;
  else if (passwordTooLong(password)) fields.password = 'Password is too long';
  return fields;
}

export function validateLogin({ email, password }) {
  const fields = {};
  const e = emailError(email);
  if (e) fields.email = e;
  if (!password) fields.password = 'Password is required';
  else if (passwordTooLong(password)) fields.password = 'Password is too long';
  return fields;
}