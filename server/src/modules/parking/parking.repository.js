const db = require('../../db');
const { SESSION_STATUS, ON_SITE_SQL } = require('./sessionStatuses');

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

// FR-05: the vehicle with this (normalised) registration number, whoever owns it.
async function findVehicleByRegistration(registrationNumber) {
  const [rows] = await db.query(
    `SELECT id, user_id, registration_number, type
     FROM vehicles
     WHERE registration_number = ?
     LIMIT 1`,
    [registrationNumber],
  );

  return rows[0] || null;
}

// The entry time MySQL recorded for a new session (UT-05_01).
async function findSessionEntryTime(connection, sessionId) {
  const [rows] = await connection.query(
    'SELECT entry_time AS entryTime FROM parking_sessions WHERE id = ?',
    [sessionId],
  );

  return rows[0].entryTime;
}

// A slot has room when it is enabled and no vehicle is in it (parked, or exited but
// not yet paid).
const SLOT_HAS_ROOM = `
  ps.is_disabled = FALSE
  AND NOT EXISTS (
    SELECT 1
    FROM parking_sessions session
    WHERE session.slot_id = ps.id
      AND session.status IN ${ON_SITE_SQL}
  )`;

// A slot is free when it has room and no reservation covers the current time.
const SLOT_IS_FREE = `
  ${SLOT_HAS_ROOM}
  AND NOT EXISTS (
    SELECT 1
    FROM reservations r
    WHERE r.slot_id = ps.id
      AND r.status = 'reserved'
      AND r.start_time <= NOW()
      AND r.end_time > NOW()
  )`;

// First candidates are few because at most one request per pooled connection is
// assigning at the same time; the larger batch is a fallback.
const CANDIDATE_BATCHES = [30, 500];

// Finds a suitable slot that is enabled, not occupied, and not reserved for the
// current time, and locks it for this transaction (NFR-04).
//
// Step 1 lists free slots without locking anything (smallest code first).
// Step 2 tries to lock them one at a time. SKIP LOCKED passes over a slot another
// request is assigning right now, and the free check is repeated once the lock is
// held, so it sees every session committed before that moment.
// Locking while sorting would lock every free slot at once, so concurrent requests
// would all be told that no slot is free.
// Must run in a READ COMMITTED transaction (see parking.service.startSession).
async function findAvailableSlot(connection, vehicleType) {
  for (const batch of CANDIDATE_BATCHES) {
    const [candidates] = await connection.query(
      `SELECT ps.id
       FROM parking_slots ps
       WHERE ps.slot_type = ?
         AND ${SLOT_IS_FREE}
       ORDER BY LENGTH(ps.code), ps.code
       LIMIT ?`,
      [vehicleType, batch],
    );

    for (const { id } of candidates) {
      const [rows] = await connection.query(
        `SELECT ps.id, ps.code, ps.slot_type AS type
         FROM parking_slots ps
         WHERE ps.id = ?
           AND ${SLOT_IS_FREE}
         FOR UPDATE SKIP LOCKED`,
        [id],
      );
      if (rows[0]) return rows[0];
    }

    if (candidates.length < batch) break; // nothing more to try
  }

  return null;
}

// DR-08: the slot this vehicle has reserved for the current time, locked for this
// transaction like findAvailableSlot. Null when it has no reservation in force, or the
// reserved slot cannot take it (disabled, still occupied, or the wrong type: DR-07).
async function findReservedSlot(connection, vehicleId, vehicleType) {
  const [candidates] = await connection.query(
    `SELECT ps.id
     FROM reservations r
     JOIN parking_slots ps ON ps.id = r.slot_id
     WHERE r.vehicle_id = ?
       AND r.status = 'reserved'
       AND r.start_time <= NOW()
       AND r.end_time > NOW()
       AND ps.slot_type = ?
       AND ${SLOT_HAS_ROOM}
     ORDER BY r.start_time, r.id`,
    [vehicleId, vehicleType],
  );

  for (const { id } of candidates) {
    const [rows] = await connection.query(
      `SELECT ps.id, ps.code, ps.slot_type AS type
       FROM parking_slots ps
       WHERE ps.id = ?
         AND ${SLOT_HAS_ROOM}
       FOR UPDATE SKIP LOCKED`,
      [id],
    );
    if (rows[0]) return rows[0];
  }

  return null;
}

// The vehicle has arrived, so its reservations in force are used: they stop holding
// their slots, and the slot is free for others once this stay is over.
async function completeReservationsInForce(connection, vehicleId) {
  await connection.query(
    `UPDATE reservations
     SET status = 'completed'
     WHERE vehicle_id = ?
       AND status = 'reserved'
       AND start_time <= NOW()
       AND end_time > NOW()`,
    [vehicleId],
  );
}

// The vehicle's session if it is still on site: parked, or exited and waiting to pay.
async function findOnSiteSessionForVehicle(connection, vehicleId) {
  const [rows] = await connection.query(
    `SELECT id, slot_id, status
     FROM parking_sessions
     WHERE vehicle_id = ?
       AND status IN ${ON_SITE_SQL}
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

// FR-07: the vehicle with this registration number and its session while it is on
// site (parked, or waiting to pay). Always read from the table, so a slot change is
// seen straight away.
async function findOnSiteSessionByRegistration(registrationNumber) {
  const [rows] = await db.query(
    `SELECT s.id AS sessionId,
            s.slot_id AS slotId,
            s.status,
            s.entry_time AS entryTime,
            v.id AS vehicleId,
            v.registration_number AS registrationNumber,
            v.type AS vehicleType,
            v.model,
            v.colour
     FROM vehicles v
     JOIN parking_sessions s ON s.vehicle_id = v.id AND s.status IN ${ON_SITE_SQL}
     WHERE v.registration_number = ?
     ORDER BY s.entry_time DESC, s.id DESC
     LIMIT 1`,
    [registrationNumber],
  );

  return rows[0] || null;
}

// FR-08: locks the vehicle with this registration number, the same row entry locks
// (startSession). Two exits, or an entry and an exit, for one vehicle then run one
// after the other instead of deadlocking on the session row.
async function lockVehicleByRegistration(connection, registrationNumber) {
  const [rows] = await connection.query(
    'SELECT id FROM vehicles WHERE registration_number = ? FOR UPDATE',
    [registrationNumber],
  );

  return rows[0] ? rows[0].id : null;
}

// FR-08: the vehicle's on-site session with its slot. Read after the vehicle row is
// locked, so a second exit sees the exit the first one recorded (DR-04, DR-10).
async function findOnSiteSessionForExit(connection, vehicleId) {
  const [rows] = await connection.query(
    `SELECT s.id,
            s.status,
            s.fee_amount AS fee,
            s.vehicle_id AS vehicleId,
            v.registration_number AS registrationNumber,
            s.slot_id AS slotId,
            ps.code AS slotCode,
            ps.slot_type AS slotType,
            s.entry_time AS entryTime
     FROM parking_sessions s
     JOIN vehicles v ON v.id = s.vehicle_id
     JOIN parking_slots ps ON ps.id = s.slot_id
     WHERE s.vehicle_id = ?
       AND s.status IN ${ON_SITE_SQL}
     ORDER BY s.id DESC
     LIMIT 1`,
    [vehicleId],
  );

  return rows[0] || null;
}

// FR-08: the exit time (the given one, or NOW()) and the stay in seconds, both worked
// out by MySQL so there are no time-zone differences between Node and the database.
async function findExitTimes(connection, sessionId, exitTime) {
  const [rows] = await connection.query(
    `SELECT DATE_FORMAT(t.exit_time, '%Y-%m-%d %H:%i:%s') AS exitTime,
            TIMESTAMPDIFF(SECOND, s.entry_time, t.exit_time) AS durationSeconds,
            t.exit_time > NOW() AS isFuture
     FROM parking_sessions s
     CROSS JOIN (SELECT COALESCE(CAST(? AS DATETIME), NOW()) AS exit_time) t
     WHERE s.id = ?`,
    [exitTime, sessionId],
  );

  const row = rows[0];
  return {
    exitTime: row.exitTime,
    durationSeconds: Number(row.durationSeconds),
    isFuture: Number(row.isFuture) === 1,
  };
}

// FR-08 / FR-09: records the exit time and the fee. The session now waits for payment,
// which completes it and releases the slot (UC-08 steps 3 and 4).
async function recordExit(connection, sessionId, { exitTime, feeAmount, billedMinutes }) {
  await connection.query(
    `UPDATE parking_sessions
     SET status = '${SESSION_STATUS.AWAITING_PAYMENT}',
         exit_time = ?,
         fee_amount = ?,
         billed_minutes = ?
     WHERE id = ?
       AND status = '${SESSION_STATUS.ACTIVE}'`,
    [exitTime, feeAmount, billedMinutes, sessionId],
  );
}

module.exports = {
  lockVehicleByRegistration,
  findOnSiteSessionForExit,
  findExitTimes,
  recordExit,
  findVehicleById,
  findVehicleByRegistration,
  findSessionEntryTime,
  findAvailableSlot,
  findReservedSlot,
  completeReservationsInForce,
  findOnSiteSessionForVehicle,
  createParkingSession,
  findOnSiteSessionByRegistration,
};