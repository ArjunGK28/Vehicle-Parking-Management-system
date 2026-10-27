const { validateUserFilter, validateNewUser, parseId } = require('../../server/src/modules/admin/admin.validation');

function fieldErrors(fn) {
  try {
    fn();
  } catch (err) {
    expect(err.status).toBe(400);
    return err.fields;
  }
  throw new Error('expected a validation error');
}

describe('validateUserFilter', () => {
  test('empty values mean no filter', () => {
    expect(validateUserFilter({})).toEqual({ role: '', search: '' });
    expect(validateUserFilter({ role: ' driver ', search: ' ravi ' })).toEqual({ role: 'driver', search: 'ravi' });
  });

  test('rejects an unknown role and an over-long search', () => {
    expect(fieldErrors(() => validateUserFilter({ role: 'manager', search: 'x'.repeat(101) }))).toEqual({
      role: 'Choose driver, attendant or admin',
      search: 'Search must be at most 100 characters',
    });
  });

  test('ignores repeated query parameters', () => {
    expect(validateUserFilter({ role: ['driver', 'admin'] })).toEqual({ role: '', search: '' });
  });
});

describe('validateNewUser', () => {
  const valid = { name: 'New Attendant', email: 'New@Example.com', password: 'Abc@123', role: 'attendant' };

  test('returns clean details with the email normalised (UT-12_02 data)', () => {
    expect(validateNewUser(valid)).toEqual({ name: 'New Attendant', email: 'new@example.com', password: 'Abc@123', role: 'attendant' });
  });

  test('requires a known role', () => {
    expect(fieldErrors(() => validateNewUser({ ...valid, role: '' }))).toEqual({ role: 'Role is required' });
    expect(fieldErrors(() => validateNewUser({ ...valid, role: 'manager' }))).toEqual({ role: 'Choose driver, attendant or admin' });
  });

  test('reports registration and role errors together', () => {
    expect(Object.keys(fieldErrors(() => validateNewUser({}))).sort()).toEqual(['email', 'name', 'password', 'role']);
  });
});

describe('parseId', () => {
  test('reads a positive whole number', () => {
    expect(parseId('12', 'User not found')).toBe(12);
  });

  test.each(['0', '1abc', '-3', ''])('treats %p as not found with the given message', (id) => {
    expect(() => parseId(id, 'User not found')).toThrow(expect.objectContaining({ status: 404, message: 'User not found' }));
  });
});
