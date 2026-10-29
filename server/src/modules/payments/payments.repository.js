const db = require('../../db');

// The session as the exit response shows it, so the pages can reuse one shape.
const SESSION_COLUMNS = `
  s.id,
  s.vehicle_id AS vehicleId,
  v.registration_number AS registrationNumber,
  s.slot_id AS slotId,
  ps.code AS slotCode,
  ps.slot_type AS slotType,
  s.entry_time AS entryTime,
  s.exit_time AS exitTime,
  s.billed_minutes AS billedMinutes,
  s.fee_amount AS fee,
  s.payment_status AS paymentStatus,
  s.status`;

// FR-10: the session with its owner, locked so two payments for one session run one
// after the other and the second sees it is already paid.
async function lockSession(connection, sessionId) {
  const [rows] = await connection.query(
    `SELECT ${SESSION_COLUMNS}, v.user_id AS ownerId
     FROM parking_sessions s
     JOIN vehicles v ON v.id = s.vehicle_id
     JOIN parking_slots ps ON ps.id = s.slot_id
     WHERE s.id = ?
     FOR UPDATE OF s`,
    [sessionId],
  );

  return rows[0] || null;
}

// SYS-13: every attempt is linked to its session. Only the last 4 card digits are stored.
async function createPayment(connection, { sessionId, amount, method, status, cardLast4, recordedBy }) {
  const [result] = await connection.query(
    `INSERT INTO payments (session_id, amount, method, status, card_last4, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [sessionId, amount, method, status, cardLast4, recordedBy],
  );

  return result.insertId;
}

async function markSessionPaid(connection, sessionId) {
  await connection.query(
    "UPDATE parking_sessions SET payment_status = 'paid' WHERE id = ?",
    [sessionId],
  );
}

async function findPayment(connection, paymentId) {
  const [rows] = await connection.query(
    `SELECT id,
            session_id AS sessionId,
            amount,
            method,
            status,
            card_last4 AS cardLast4,
            created_at AS createdAt
     FROM payments
     WHERE id = ?`,
    [paymentId],
  );

  return rows[0];
}

// The driver's completed sessions that still need paying, newest exit first.
async function findUnpaidForUser(userId) {
  const [rows] = await db.query(
    `SELECT ${SESSION_COLUMNS}
     FROM parking_sessions s
     JOIN vehicles v ON v.id = s.vehicle_id
     JOIN parking_slots ps ON ps.id = s.slot_id
     WHERE v.user_id = ?
       AND s.status = 'completed'
       AND s.payment_status = 'unpaid'
     ORDER BY s.exit_time DESC, s.id DESC`,
    [userId],
  );

  return rows;
}

module.exports = { lockSession, createPayment, markSessionPaid, findPayment, findUnpaidForUser };