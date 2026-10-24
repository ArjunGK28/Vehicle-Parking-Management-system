const db = require('../../db');

async function create(userId, tokenHash) {
  await db.query('INSERT INTO auth_sessions (user_id, token_hash) VALUES (?, ?)', [userId, tokenHash]);
}

// idleSeconds is worked out by MySQL so it never depends on the Node time zone.
async function findByTokenHash(tokenHash) {
  const [rows] = await db.query(
    `SELECT id, user_id AS userId, last_seen_at AS lastSeenAt,
            TIMESTAMPDIFF(SECOND, last_seen_at, CURRENT_TIMESTAMP) AS idleSeconds
       FROM auth_sessions WHERE token_hash = ?`,
    [tokenHash],
  );
  return rows[0] || null;
}

// Marks the session as used just now (NFR-14).
async function touch(id) {
  await db.query('UPDATE auth_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
}

async function deleteById(id) {
  await db.query('DELETE FROM auth_sessions WHERE id = ?', [id]);
}

async function deleteByTokenHash(tokenHash) {
  await db.query('DELETE FROM auth_sessions WHERE token_hash = ?', [tokenHash]);
}

module.exports = { create, findByTokenHash, touch, deleteById, deleteByTokenHash };