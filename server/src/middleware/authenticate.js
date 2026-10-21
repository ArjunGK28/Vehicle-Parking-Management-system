const { HttpError } = require('../errors');
const { SESSION_COOKIE } = require('../sessionCookie');
const usersService = require('../modules/users/users.service');

// Security layer (NFR-10): protected routes need a valid session.
// Sets req.user to { id, name, email, role, createdAt }.
async function authenticate(req, res, next) {
  const user = await usersService.getUserForToken(req.cookies[SESSION_COOKIE]);
  if (!user) throw new HttpError(401, 'Please log in to continue');
  req.user = user;
  next();
}

module.exports = authenticate;
