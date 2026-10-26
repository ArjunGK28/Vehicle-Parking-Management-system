
const db = require('../../db');

async function findByUserId(userId) {
  const [rows] = await db.query(
    `SELECT id, user_id AS userId,
            registration_number AS registrationNumber,
            type, model, colour,
            created_at AS createdAt
     FROM vehicles
     WHERE user_id = ?
     ORDER BY id DESC`,
    [userId],
  );

  return rows;
}

async function findByIdAndUserId(id, userId) {
  const [rows] = await db.query(
    `SELECT id, user_id AS userId,
            registration_number AS registrationNumber,
            type, model, colour,
            created_at AS createdAt
     FROM vehicles
     WHERE id = ? AND user_id = ?`,
    [id, userId],
  );

  return rows[0] || null;
}

async function create({ userId, registrationNumber, type, model, colour }) {
  const [result] = await db.query(
    `INSERT INTO vehicles
       (user_id, registration_number, type, model, colour)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, registrationNumber, type, model, colour],
  );

  return findByIdAndUserId(result.insertId, userId);
}

async function update(id, userId, { registrationNumber, type, model, colour }) {
  await db.query(
    `UPDATE vehicles
     SET registration_number = ?, type = ?, model = ?, colour = ?
     WHERE id = ? AND user_id = ?`,
    [registrationNumber, type, model, colour, id, userId],
  );

  return findByIdAndUserId(id, userId);
}

async function remove(id, userId) {
  const [result] = await db.query(
    'DELETE FROM vehicles WHERE id = ? AND user_id = ?',
    [id, userId],
  );

  return result.affectedRows > 0;
}

module.exports = {
  findByUserId,
  findByIdAndUserId,
  create,
  update,
  remove,
};
