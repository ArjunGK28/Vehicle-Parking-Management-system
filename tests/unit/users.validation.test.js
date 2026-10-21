const {
  validateRegistration,
  validateLogin,
} = require('../../server/src/modules/users/users.validation');

function fieldErrors(fn) {
  try {
    fn();
  } catch (err) {
    expect(err.status).toBe(400);
    return err.fields;
  }
  throw new Error('expected a validation error');
}

describe('validateRegistration', () => {
  test('accepts the Test Plan details and normalises email (UT_01 data)', () => {
    const result = validateRegistration({ name: ' Arjun ', email: 'Arjun@Example.com ', password: 'Abc@123' });
    expect(result).toEqual({ name: 'Arjun', email: 'arjun@example.com', password: 'Abc@123' });
  });

  test('rejects a malformed email such as abc@com (IT_03 data)', () => {
    const fields = fieldErrors(() => validateRegistration({ name: 'Arjun', email: 'abc@com', password: 'Abc@123' }));
    expect(fields).toEqual({ email: 'Enter a valid email address' });
  });

  test('reports every missing field at once', () => {
    const fields = fieldErrors(() => validateRegistration({}));
    expect(Object.keys(fields).sort()).toEqual(['email', 'name', 'password']);
  });

  test('rejects a password shorter than 6 characters', () => {
    const fields = fieldErrors(() => validateRegistration({ name: 'Arjun', email: 'a@b.co', password: 'Ab@1' }));
    expect(fields.password).toMatch(/at least 6/);
  });

  test('rejects a password longer than 72 bytes', () => {
    const fields = fieldErrors(() => validateRegistration({ name: 'Arjun', email: 'a@b.co', password: 'x'.repeat(73) }));
    expect(fields.password).toBe('Password is too long');
  });

  test('ignores non-string values', () => {
    const fields = fieldErrors(() => validateRegistration({ name: 42, email: ['a@b.co'], password: { p: 1 } }));
    expect(Object.keys(fields).sort()).toEqual(['email', 'name', 'password']);
  });
});

describe('validateLogin', () => {
  test('requires email and password', () => {
    const fields = fieldErrors(() => validateLogin({ email: '', password: '' }));
    expect(fields).toEqual({ email: 'Email is required', password: 'Password is required' });
  });

  test('normalises the email', () => {
    expect(validateLogin({ email: ' ARJUN@example.com', password: 'Abc@123' }).email).toBe('arjun@example.com');
  });
});
