
const db = require('../../db');

async function findVehicleById(vehicleId, userId = null) {
  const query = userId
    ? `SELECT id, user_id, registration_number, type
       FROM vehicles
       WHERE id = ? AND user_id = ?
       LIMIT 1`
    : `SELECT id, user_id, registration_number, type
       FROM vehicles
       WHERE id = ?
       LIMIT 1`;

  const params = userId ? [vehicleId, userId] : [vehicleId];
  const [rows] = await db.query(query, params);

  return rows[0] || null;
}

// Finds a suitable slot that is enabled, not occupied,
// and not reserved for the current time.
async function findAvailableSlot(connection, vehicleType) {
  const [rows] = await connection.query(
    `SELECT ps.id, ps.code, ps.slot_type AS type
     FROM parking_slots ps
     WHERE ps.slot_type = ?
       AND ps.is_disabled = FALSE
       AND NOT EXISTS (
         SELECT 1
         FROM parking_sessions session
         WHERE session.slot_id = ps.id
           AND session.status = 'active'
       )
       AND NOT EXISTS (
         SELECT 1
         FROM reservations r
         WHERE r.slot_id = ps.id
           AND r.status = 'reserved'
           AND r.start_time <= NOW()
           AND r.end_time > NOW()
       )
     ORDER BY LENGTH(ps.code), ps.code
     LIMIT 1
     FOR UPDATE`,
    [vehicleType],
  );

  return rows[0] || null;
}

// Checks whether the vehicle already has an active parking session.
async function findActiveSessionForVehicle(connection, vehicleId) {
  const [rows] = await connection.query(
    `SELECT id, slot_id
     FROM parking_sessions
     WHERE vehicle_id = ?
       AND status = 'active'
     LIMIT 1`,
    [vehicleId],
  );

  return rows[0] || null;
}

// Creates the active parking session for the assigned vehicle and slot.
async function createParkingSession(connection, vehicleId, slotId) {
  const [result] = await connection.query(
    `INSERT INTO parking_sessions (vehicle_id, slot_id)
     VALUES (?, ?)`,
    [vehicleId, slotId],
  );

  return result.insertId;
}

// FR-07: the vehicle with this registration number and its current active session.
// Always read from the table, so a slot change is seen straight away.
async function findActiveSessionByRegistration(registrationNumber) {
  const [rows] = await db.query(
    `SELECT s.id AS sessionId,
            s.slot_id AS slotId,
            s.entry_time AS entryTime,
            v.id AS vehicleId,
            v.registration_number AS registrationNumber,
            v.type AS vehicleType,
            v.model,
            v.colour
     FROM vehicles v
     JOIN parking_sessions s ON s.vehicle_id = v.id AND s.status = 'active'
     WHERE v.registration_number = ?
     ORDER BY s.entry_time DESC, s.id DESC
     LIMIT 1`,
    [registrationNumber],
  );

  return rows[0] || null;
}

module.exports = {
  findVehicleById,
  findAvailableSlot,
  findActiveSessionForVehicle,
  createParkingSession,
  findActiveSessionByRegistration,
};