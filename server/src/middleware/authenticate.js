const { HttpError } = require('../errors');
const { readSessionToken } = require('../sessionCookie');
const usersService = require('../modules/users/users.service');

// A page refreshing itself in the background sends this header. Such a request shows the
// page is open, not that the person is active, so it must not extend the session (NFR-14).
const BACKGROUND_HEADER = 'x-background-refresh';

// Security layer (NFR-10): protected routes need a valid session.
// Sets req.user to { id, name, email, role, createdAt }.
async function authenticate(req, res, next) {
  const keepAlive = req.get(BACKGROUND_HEADER) !== 'true';
  const user = await usersService.getUserForToken(readSessionToken(req), { keepAlive });
  if (!user) throw new HttpError(401, 'Please log in to continue');
  req.user = user;
  next();
}

module.exports = authenticate;