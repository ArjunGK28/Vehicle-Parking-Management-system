const db = require('../../server/src/db');

// Empties every table so each test starts from a clean database.
// Uses one connection because FOREIGN_KEY_CHECKS is a per-connection setting.
async function clearTables() {
  const conn = await db.getConnection();
  try {
    const [rows] = await conn.query(
      'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()',
    );
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const { name } of rows) await conn.query('TRUNCATE TABLE ??', [name]);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    conn.release();
  }
}

module.exports = { db, clearTables };
