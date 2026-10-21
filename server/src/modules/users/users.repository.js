const db = require('../../db');

const PUBLIC_COLUMNS = 'id, name, email, role, created_at AS createdAt';

async function findByEmailWithHash(email) {
  const [rows] = await db.query(
    `SELECT ${PUBLIC_COLUMNS}, password_hash AS passwordHash FROM users WHERE email = ?`,
    [email],
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await db.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`, [id]);
  return rows[0] || null;
}

// Returns the new user's id. Throws mysql2's ER_DUP_ENTRY if the email is taken.
async function create({ name, email, passwordHash, role = 'driver' }) {
  const [result] = await db.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [name, email, passwordHash, role],
  );
  return result.insertId;
}

module.exports = { findByEmailWithHash, findById, create };
