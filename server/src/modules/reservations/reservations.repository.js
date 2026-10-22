
const db = require('../../db');

async function findConflictingReservation(slotId, startTime, endTime) {
  const [rows] = await db.query(
    `SELECT id, slot_id, start_time, end_time
     FROM reservations
     WHERE slot_id = ?
       AND status = 'reserved'
       AND start_time < ?
       AND end_time > ?
     LIMIT 1`,
    [slotId, endTime, startTime]
  );

  return rows[0] || null;
}

async function findByIdAndUser(id, userId) {
  const [rows] = await db.query(
    `SELECT id, user_id, vehicle_id, slot_id,
            start_time, end_time, status, created_at
     FROM reservations
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [id, userId]
  );

  return rows[0] || null;
}

async function findByUser(userId) {
  const [rows] = await db.query(
    `SELECT id, user_id, vehicle_id, slot_id,
            start_time, end_time, status, created_at
     FROM reservations
     WHERE user_id = ?
     ORDER BY start_time DESC, id DESC`,
    [userId]
  );

  return rows;
}

async function create({
  userId,
  vehicleId,
  slotId,
  startTime,
  endTime,
}) {
  const [result] = await db.query(
    `INSERT INTO reservations
       (user_id, vehicle_id, slot_id, start_time, end_time)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, vehicleId, slotId, startTime, endTime]
  );

  return findByIdAndUser(result.insertId, userId);
}

module.exports = {
  findConflictingReservation,
  findByIdAndUser,
  findByUser,
  create,
};
