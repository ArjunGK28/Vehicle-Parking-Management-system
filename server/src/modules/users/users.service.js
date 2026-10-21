const crypto = require('node:crypto');
const { HttpError } = require('../../errors');
const users = require('./users.repository');
const sessions = require('./sessions.repository');
const { hashPassword, verifyPassword } = require('./password');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// UC-01 main flow steps 1-2: validate, then create a driver account.
async function register({ name, email, password }) {
  const passwordHash = await hashPassword(password);
  let id;
  try {
    id = await users.create({ name, email, passwordHash });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'An account with this email already exists', {
        email: 'Email is already in use',
      });
    }
    throw err;
  }
  return users.findById(id);
}

// UC-01 main flow steps 3-4. Returns the user and a new session token for the cookie.
// The same message is used for an unknown email and a wrong password, so the
// response does not reveal which accounts exist (UC-01 alternative flow).
async function login({ email, password }) {
  const found = await users.findByEmailWithHash(email);
  const ok = await verifyPassword(password, found && found.passwordHash);
  if (!found || !ok) throw new HttpError(401, 'Invalid email or password');

  const token = crypto.randomBytes(32).toString('base64url');
  await sessions.create(found.id, hashToken(token));

  const { passwordHash, ...user } = found;
  return { user, token };
}

async function logout(token) {
  if (token) await sessions.deleteByTokenHash(hashToken(token));
}

// Returns the logged-in user for a session token, or null.
async function getUserForToken(token) {
  if (!token) return null;
  const session = await sessions.findByTokenHash(hashToken(token));
  if (!session) return null;
  return users.findById(session.userId);
}

module.exports = { register, login, logout, getUserForToken };
