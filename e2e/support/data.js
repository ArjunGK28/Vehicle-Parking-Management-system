require('./env');
const mysql = require('mysql2/promise');
const config = require('../../server/src/config');
const { hashPassword } = require('../../server/src/modules/users/password');

const PASSWORD = 'E2e@12345';

const ACCOUNTS = {
  admin: { name: 'E2E Admin', email: 'admin@e2e.test', password: PASSWORD, role: 'admin' },
  attendant: { name: 'E2E Attendant', email: 'attendant@e2e.test', password: PASSWORD, role: 'attendant' },
  driver: { name: 'E2E Driver', email: 'driver@e2e.test', password: PASSWORD, role: 'driver' },
};

// P-01..P-10 for cars, B-01..B-05 for two-wheelers.
const SLOTS = [
  ...Array.from({ length: 10 }, (_, i) => [`P-${String(i + 1).padStart(2, '0')}`, 'four_wheeler']),
  ...Array.from({ length: 5 }, (_, i) => [`B-${String(i + 1).padStart(2, '0')}`, 'two_wheeler']),
];

let passwordHash;

// Empties every table, then adds the three accounts, the slots, the parking rates and
// the given vehicles (all owned by the driver). Every test starts from this same state.
//   await resetData({ vehicles: [{ plate: 'KA01AB1234' }] })
async function resetData({ vehicles = [] } = {}) {
  passwordHash = passwordHash || (await hashPassword(PASSWORD));
  const conn = await mysql.createConnection({ ...config.db, multipleStatements: false });
  try {
    const [tables] = await conn.query(
      'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()',
    );
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const { name } of tables) await conn.query('TRUNCATE TABLE ??', [name]);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    await conn.query('INSERT INTO users (name, email, password_hash, role) VALUES ?', [
      Object.values(ACCOUNTS).map((a) => [a.name, a.email, passwordHash, a.role]),
    ]);
    await conn.query('INSERT INTO parking_slots (code, slot_type) VALUES ?', [SLOTS]);
    await conn.query(
      `INSERT INTO parking_rates (slot_type, hourly_rate, minimum_fee, billing_step_minutes)
       VALUES ('four_wheeler', 20, 10, 15), ('two_wheeler', 10, 5, 15)`,
    );

    if (vehicles.length > 0) {
      const [[driver]] = await conn.query('SELECT id FROM users WHERE email = ?', [ACCOUNTS.driver.email]);
      await conn.query('INSERT INTO vehicles (user_id, registration_number, type, model, colour) VALUES ?', [
        vehicles.map((v) => [driver.id, v.plate, v.type || 'four_wheeler', 'Swift', 'Red']),
      ]);
    }
  } finally {
    await conn.end();
  }
}

module.exports = { ACCOUNTS, PASSWORD, resetData };