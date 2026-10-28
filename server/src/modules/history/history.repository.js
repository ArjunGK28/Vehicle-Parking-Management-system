const db = require('../../db');

// Only completed sessions are history (FR-11). Duration is worked out by MySQL
// so it never depends on the Node time zone. Nothing here writes to parking_sessions:
// a past session cannot be edited through history (DR-10).
const HISTORY_COLUMNS = `
  s.id,
  s.vehicle_id AS vehicleId,
  v.registration_number AS registrationNumber,
  v.type AS vehicleType,
  ps.code AS slotCode,
  ps.slot_type AS slotType,
  s.entry_time AS entryTime,
  s.exit_time AS exitTime,
  TIMESTAMPDIFF(SECOND, s.entry_time, s.exit_time) AS durationSeconds,
  s.billed_minutes AS billedMinutes,
  s.fee_amount AS fee,
  s.status,
  s.payment_status AS paymentStatus`;

// Number of completed sessions and the total of their fees, for one user.
async function summarise(userId) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total, COALESCE(SUM(s.fee_amount), 0) AS totalFee
       FROM parking_sessions s
       JOIN vehicles v ON v.id = s.vehicle_id
      WHERE v.user_id = ? AND s.status = 'completed'`,
    [userId],
  );
  return { total: Number(rows[0].total), totalFee: Number(rows[0].totalFee) };
}

// Newest exit first; the id breaks ties so pages never repeat or skip a session.
async function findCompleted(userId, { limit, offset }) {
  const [rows] = await db.query(
    `SELECT ${HISTORY_COLUMNS}
       FROM parking_sessions s
       JOIN vehicles v ON v.id = s.vehicle_id
       JOIN parking_slots ps ON ps.id = s.slot_id
      WHERE v.user_id = ? AND s.status = 'completed'
      ORDER BY s.exit_time DESC, s.id DESC
      LIMIT ? OFFSET ?`,
    [userId, limit, offset],
  );
  return rows.map((row) => ({ ...row, durationSeconds: Number(row.durationSeconds) }));
}

module.exports = { summarise, findCompleted };