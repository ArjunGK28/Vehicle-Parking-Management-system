const { HttpError } = require('../errors');
const { ALL_ROLES } = require('../modules/users/roles');
const authenticate = require('./authenticate');

// Security layer (NFR-11): only users whose role is listed may continue.
// Must run after authenticate, which sets req.user.
function requireRole(...allowed) {
  const unknown = allowed.filter((role) => !ALL_ROLES.includes(role));
  if (allowed.length === 0 || unknown.length > 0) {
    throw new Error(`requireRole needs valid roles, got: ${allowed.join(', ') || 'none'}`);
  }

  return function checkRole(req, res, next) {
    if (!req.user) throw new HttpError(401, 'Please log in to continue');
    if (!allowed.includes(req.user.role)) {
      throw new HttpError(403, 'You do not have permission to do this');
    }
    next();
  };
}

// Shorthand for protecting a route: log-in check, then role check.
//   router.post('/slots', allowRoles(ROLES.ADMIN), controller.create)
function allowRoles(...allowed) {
  return [authenticate, requireRole(...allowed)];
}

module.exports = { requireRole, allowRoles };
