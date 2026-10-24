const db = require('../../db');

// Status is worked out live, so it is right the moment a session or reservation changes (FR-03):
//   Unavailable: an admin disabled the slot
//   Occupied:    a vehicle has an active parking session in it
//   Reserved:    a reservation covers the current time
//   Available:   none of the above
// The reserved rule matches parking.repository.findAvailableSlot.
const SLOT_COLUMNS = `
  id, code, slot_type AS type,
  CASE
    WHEN is_disabled THEN 'unavailable'
    WHEN EXISTS (
      SELECT 1
      FROM parking_sessions session
      WHERE session.slot_id = parking_slots.id
        AND session.status = 'active'
    ) THEN 'occupied'
    WHEN EXISTS (
      SELECT 1
      FROM reservations r
      WHERE r.slot_id = parking_slots.id
        AND r.status = 'reserved'
        AND r.start_time <= NOW()
        AND r.end_time > NOW()
    ) THEN 'reserved'
    ELSE 'available'
  END AS status,
  created_at AS createdAt`;

// Sorts P-2 before P-10.
const BY_CODE = 'ORDER BY LENGTH(code), code';

async function findAll() {
  const [rows] = await db.query(`SELECT ${SLOT_COLUMNS} FROM parking_slots ${BY_CODE}`);
  return rows;
}

async function findById(id) {
  const [rows] = await db.query(`SELECT ${SLOT_COLUMNS} FROM parking_slots WHERE id = ?`, [id]);
  return rows[0] || null;
}

// Slots of this type that may be handed to a vehicle. Disabled slots never qualify.
async function findAssignable(type) {
  const [rows] = await db.query(
    `SELECT ${SLOT_COLUMNS} FROM parking_slots
      WHERE slot_type = ? AND is_disabled = FALSE ${BY_CODE}`,
    [type],
  );
  return rows;
}

// Returns the new slot's id. Throws mysql2's ER_DUP_ENTRY if the code is taken.
async function create({ code, type }) {
  const [result] = await db.query('INSERT INTO parking_slots (code, slot_type) VALUES (?, ?)', [code, type]);
  return result.insertId;
}

async function setDisabled(id, disabled) {
  await db.query('UPDATE parking_slots SET is_disabled = ? WHERE id = ?', [disabled, id]);
}

module.exports = { findAll, findById, findAssignable, create, setDisabled };