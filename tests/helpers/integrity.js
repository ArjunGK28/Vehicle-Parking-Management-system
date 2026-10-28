const { db } = require('./db');
const { calculateFee } = require('../../server/src/modules/rates/fees');

// Looks for rows that break the relationships and rules the data must always keep
// (NFR-06, NFR-09, DR-02, DR-07, DR-10). Returns a list of problems; [] means the
// data is consistent, so a test can `expect(await findIntegrityProblems()).toEqual([])`
// and see exactly what is wrong when it is not.
const CHECKS = [
  ['a slot has more than one active session',
    `SELECT slot_id AS id FROM parking_sessions WHERE status = 'active' GROUP BY slot_id HAVING COUNT(*) > 1`],
  ['a vehicle has more than one active session',
    `SELECT vehicle_id AS id FROM parking_sessions WHERE status = 'active' GROUP BY vehicle_id HAVING COUNT(*) > 1`],
  ['a session points to a vehicle that does not exist',
    `SELECT s.id FROM parking_sessions s LEFT JOIN vehicles v ON v.id = s.vehicle_id WHERE v.id IS NULL`],
  ['a session points to a slot that does not exist',
    `SELECT s.id FROM parking_sessions s LEFT JOIN parking_slots p ON p.id = s.slot_id WHERE p.id IS NULL`],
  ['a vehicle points to a user that does not exist',
    `SELECT v.id FROM vehicles v LEFT JOIN users u ON u.id = v.user_id WHERE u.id IS NULL`],
  ['a login session points to a user that does not exist',
    `SELECT a.id FROM auth_sessions a LEFT JOIN users u ON u.id = a.user_id WHERE u.id IS NULL`],
  ['a reservation points to a user, vehicle or slot that does not exist',
    `SELECT r.id FROM reservations r
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN vehicles v ON v.id = r.vehicle_id
       LEFT JOIN parking_slots p ON p.id = r.slot_id
      WHERE u.id IS NULL OR v.id IS NULL OR p.id IS NULL`],
  ['two reserved reservations overlap on the same slot',
    `SELECT a.id FROM reservations a JOIN reservations b
        ON a.slot_id = b.slot_id AND a.id < b.id AND a.status = 'reserved' AND b.status = 'reserved'
       AND a.start_time < b.end_time AND b.start_time < a.end_time`],
  ['a completed session is missing its exit time, fee or billed minutes, or exits before it entered',
    `SELECT id FROM parking_sessions
      WHERE status = 'completed'
        AND (exit_time IS NULL OR fee_amount IS NULL OR billed_minutes IS NULL OR exit_time < entry_time)`],
  ['an active session already has an exit time or a fee',
    `SELECT id FROM parking_sessions
      WHERE status = 'active' AND (exit_time IS NOT NULL OR fee_amount IS NOT NULL OR billed_minutes IS NOT NULL)`],
  ['a session is marked paid before it is completed',
    `SELECT id FROM parking_sessions WHERE payment_status = 'paid' AND status <> 'completed'`],
  ['a vehicle is parked in a slot of a different type (DR-07)',
    `SELECT s.id FROM parking_sessions s
       JOIN vehicles v ON v.id = s.vehicle_id
       JOIN parking_slots p ON p.id = s.slot_id
      WHERE v.type <> p.slot_type`],
];

// A completed session's fee must be what the configured rate gives for its stay (FR-09).
// Skipped for slot types that have no rate row.
async function feeProblems() {
  const [rows] = await db.query(
    `SELECT s.id, s.fee_amount AS fee, s.billed_minutes AS billed,
            TIMESTAMPDIFF(SECOND, s.entry_time, s.exit_time) AS seconds,
            r.hourly_rate AS hourlyRate, r.minimum_fee AS minimumFee, r.billing_step_minutes AS billingStepMinutes
       FROM parking_sessions s
       JOIN parking_slots p ON p.id = s.slot_id
       JOIN parking_rates r ON r.slot_type = p.slot_type
      WHERE s.status = 'completed' AND s.fee_amount IS NOT NULL AND s.exit_time IS NOT NULL`,
  );
  return rows
    .filter((row) => {
      const expected = calculateFee(Number(row.seconds), row);
      return expected.amount !== row.fee || expected.billedMinutes !== row.billed;
    })
    .map((row) => row.id);
}

async function findIntegrityProblems() {
  const problems = [];
  for (const [message, sql] of CHECKS) {
    const [rows] = await db.query(sql);
    if (rows.length > 0) problems.push(`${message}: ids ${rows.map((r) => r.id).join(', ')}`);
  }
  const wrongFees = await feeProblems();
  if (wrongFees.length > 0) problems.push(`a completed session's fee does not match the rate: ids ${wrongFees.join(', ')}`);
  return problems;
}

module.exports = { findIntegrityProblems };