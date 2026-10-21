const { HttpError } = require('../errors');
const { readSessionToken } = require('../sessionCookie');
const usersService = require('../modules/users/users.service');

// Security layer (NFR-10): protected routes need a valid session.
// Sets req.user to { id, name, email, role, createdAt }.
async function authenticate(req, res, next) {
  const user = await usersService.getUserForToken(readSessionToken(req));
  if (!user) throw new HttpError(401, 'Please log in to continue');
  req.user = user;
  next();
}

module.exports = authenticate;