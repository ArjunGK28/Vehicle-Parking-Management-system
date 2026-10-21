const { requireRole } = require('../../server/src/middleware/requireRole');
const { ROLES } = require('../../server/src/modules/users/roles');

function run(middleware, user) {
  const next = jest.fn();
  try {
    middleware({ user }, {}, next);
  } catch (err) {
    return { status: err.status, next };
  }
  return { status: null, next };
}

describe('requireRole', () => {
  test('lets an allowed role through', () => {
    const { status, next } = run(requireRole(ROLES.ADMIN), { role: 'admin' });
    expect(status).toBeNull();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('accepts any of several allowed roles', () => {
    const check = requireRole(ROLES.ATTENDANT, ROLES.ADMIN);
    expect(run(check, { role: 'attendant' }).next).toHaveBeenCalled();
    expect(run(check, { role: 'admin' }).next).toHaveBeenCalled();
  });

  test('refuses a role that is not listed with 403', () => {
    const { status, next } = run(requireRole(ROLES.ADMIN), { role: 'driver' });
    expect(status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('refuses a request with no logged-in user with 401', () => {
    expect(run(requireRole(ROLES.DRIVER), undefined).status).toBe(401);
  });

  test('fails fast when given no roles or a misspelt role', () => {
    expect(() => requireRole()).toThrow(/valid roles/);
    expect(() => requireRole('administrator')).toThrow(/valid roles/);
  });
});
