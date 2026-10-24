const crypto = require('node:crypto');
const config = require('../../config');
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

// NFR-13: message shown for a locked account.
function lockedError(secondsLeft) {
  const minutes = Math.max(1, Math.ceil(secondsLeft / 60));
  const unit = minutes === 1 ? 'minute' : 'minutes';
  return new HttpError(423, `Account locked after too many failed login attempts. Try again in ${minutes} ${unit}.`);
}

// UC-01 main flow steps 3-4. Returns the user and a new session token for the cookie.
// The same message is used for an unknown email and a wrong password, so the
// response does not reveal which accounts exist (UC-01 alternative flow).
// NFR-13: after config.lockout.maxAttempts consecutive failures the account is locked temporarily.
async function login({ email, password }) {
  const found = await users.findByEmailWithHash(email);

  // A locked account is refused before the password is checked,
  // so guessing during the lock gets nowhere (even a correct password is refused).
  if (found && found.isLocked) throw lockedError(found.lockSecondsLeft);

  const ok = await verifyPassword(password, found && found.passwordHash);
  if (!found || !ok) {
    if (found) {
      const state = await users.recordFailedLogin(found.id, {
        maxAttempts: config.lockout.maxAttempts,
        lockSeconds: config.lockout.durationMinutes * 60,
      });
      if (state.isLocked) throw lockedError(state.lockSecondsLeft);
    }
    throw new HttpError(401, 'Invalid email or password');
  }

  if (found.failedLoginAttempts > 0 || found.lockedUntil) await users.clearFailedLogins(found.id);

  const token = crypto.randomBytes(32).toString('base64url');
  await sessions.create(found.id, hashToken(token));

  const { passwordHash, failedLoginAttempts, lockedUntil, isLocked, lockSecondsLeft, ...user } = found;
  return { user, token };
}

async function logout(token) {
  if (token) await sessions.deleteByTokenHash(hashToken(token));
}

// Returns the logged-in user for a session token, or null.
// NFR-14: a session idle for config.session.idleTimeoutMinutes or more is deleted and refused.
// A normal request restarts the idle clock; keepAlive: false (background refresh) does not.
async function getUserForToken(token, { keepAlive = true } = {}) {
  if (!token) return null;
  const session = await sessions.findByTokenHash(hashToken(token));
  if (!session) return null;

  if (Number(session.idleSeconds) >= config.session.idleTimeoutMinutes * 60) {
    await sessions.deleteById(session.id);
    return null;
  }

  const user = await users.findById(session.userId);
  if (!user) return null;
  if (keepAlive) await sessions.touch(session.id);
  return user;
}

module.exports = { register, login, logout, getUserForToken };