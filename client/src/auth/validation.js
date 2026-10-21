// Same rules as server/src/modules/users/users.validation.js, checked before submitting
// so the user gets instant feedback. The server still checks everything again.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailError(email) {
  if (!email.trim()) return 'Email is required';
  if (!EMAIL_PATTERN.test(email.trim())) return 'Enter a valid email address';
  return null;
}

export function validateRegistration({ name, email, password }) {
  const fields = {};
  const trimmed = name.trim();
  if (!trimmed) fields.name = 'Name is required';
  else if (trimmed.length < 2 || trimmed.length > 100) fields.name = 'Name must be 2 to 100 characters';
  const e = emailError(email);
  if (e) fields.email = e;
  if (!password) fields.password = 'Password is required';
  else if (password.length < 6) fields.password = 'Password must be at least 6 characters';
  return fields;
}

export function validateLogin({ email, password }) {
  const fields = {};
  const e = emailError(email);
  if (e) fields.email = e;
  if (!password) fields.password = 'Password is required';
  return fields;
}
