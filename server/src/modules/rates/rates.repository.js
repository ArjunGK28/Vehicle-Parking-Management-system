const db = require('../../db');

const RATE_COLUMNS = `
  slot_type AS type,
  hourly_rate AS hourlyRate,
  minimum_fee AS minimumFee,
  billing_step_minutes AS billingStepMinutes,
  updated_at AS updatedAt`;

async function findAll() {
  const [rows] = await db.query(`SELECT ${RATE_COLUMNS} FROM parking_rates ORDER BY slot_type DESC`);
  return rows;
}

// Always reads the stored row, so a rate an administrator just changed is used straight away.
// executor is the pool by default; a transaction passes its own connection so that it does
// not ask the pool for a second connection while it holds the first (NFR-04, NFR-06).
async function findByType(type, executor = db) {
  const [rows] = await executor.query(`SELECT ${RATE_COLUMNS} FROM parking_rates WHERE slot_type = ?`, [type]);
  return rows[0] || null;
}

// Creates the rate if it is missing, otherwise replaces it.
async function save(type, { hourlyRate, minimumFee, billingStepMinutes }, updatedBy) {
  await db.query(
    `INSERT INTO parking_rates (slot_type, hourly_rate, minimum_fee, billing_step_minutes, updated_by)
     VALUES (?, ?, ?, ?, ?) AS new
     ON DUPLICATE KEY UPDATE
       hourly_rate = new.hourly_rate,
       minimum_fee = new.minimum_fee,
       billing_step_minutes = new.billing_step_minutes,
       updated_by = new.updated_by`,
    [type, hourlyRate, minimumFee, billingStepMinutes, updatedBy],
  );
}

module.exports = { findAll, findByType, save };