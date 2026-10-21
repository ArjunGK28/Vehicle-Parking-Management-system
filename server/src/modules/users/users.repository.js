const db = require('../../db');
const { ROLES } = require('./roles');

const PUBLIC_COLUMNS = 'id, name, email, role, created_at AS createdAt';

// Lock state is computed by MySQL in UTC, so it does not depend on the Node or server time zone.
const LOCK_STATE = `
  locked_until > UTC_TIMESTAMP() AS isLocked,
  GREATEST(TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), locked_until), 0) AS lockSecondsLeft`;

async function findByEmailWithHash(email) {
  const [rows] = await db.query(
    `SELECT ${PUBLIC_COLUMNS},
            password_hash AS passwordHash,
            failed_login_attempts AS failedLoginAttempts,
            locked_until AS lockedUntil,
            ${LOCK_STATE}
       FROM users WHERE email = ?`,
    [email],
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await db.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`, [id]);
  return rows[0] || null;
}

// Returns the new user's id. Throws mysql2's ER_DUP_ENTRY if the email is taken.
async function create({ name, email, passwordHash, role = ROLES.DRIVER }) {
  const [result] = await db.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [name, email, passwordHash, role],
  );
  return result.insertId;
}

// Counts one failed login. On the maxAttempts-th consecutive failure the account is locked
// and the counter restarts. A single UPDATE keeps the count right when attempts overlap;
// both assignments read the counter's value from before this update.
// Returns { isLocked, lockSecondsLeft } as it stands after the update.
async function recordFailedLogin(id, { maxAttempts, lockSeconds }) {
  await db.query(
    `UPDATE users
        SET locked_until = IF(failed_login_attempts + 1 >= ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND), locked_until),
            failed_login_attempts = IF(failed_login_attempts + 1 >= ?, 0, failed_login_attempts + 1)
      WHERE id = ?`,
    [maxAttempts, lockSeconds, maxAttempts, id],
  );
  const [rows] = await db.query(`SELECT ${LOCK_STATE} FROM users WHERE id = ?`, [id]);
  const row = rows[0] || {};
  return { isLocked: Boolean(row.isLocked), lockSecondsLeft: row.lockSecondsLeft || 0 };
}

// Called after a successful login.
async function clearFailedLogins(id) {
  await db.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?', [id]);
}

module.exports = { findByEmailWithHash, findById, create, recordFailedLogin, clearFailedLogins };