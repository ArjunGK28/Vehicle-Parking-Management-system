const db = require('../../db');

async function create(userId, tokenHash) {
  await db.query('INSERT INTO auth_sessions (user_id, token_hash) VALUES (?, ?)', [userId, tokenHash]);
}

async function findByTokenHash(tokenHash) {
  const [rows] = await db.query(
    'SELECT id, user_id AS userId, last_seen_at AS lastSeenAt FROM auth_sessions WHERE token_hash = ?',
    [tokenHash],
  );
  return rows[0] || null;
}

async function deleteByTokenHash(tokenHash) {
  await db.query('DELETE FROM auth_sessions WHERE token_hash = ?', [tokenHash]);
}

module.exports = { create, findByTokenHash, deleteByTokenHash };
