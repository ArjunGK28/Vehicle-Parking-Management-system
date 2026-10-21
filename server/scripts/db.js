// Applies database/schema.sql to the configured database.
//   node scripts/db.js init    create missing tables, keep data
//   node scripts/db.js reset   drop every table, then create them again
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const config = require('../src/config');

const SCHEMA_FILE = path.join(__dirname, '..', '..', 'database', 'schema.sql');

async function connect() {
  return mysql.createConnection({ ...config.db, multipleStatements: true });
}

async function dropAllTables(conn) {
  const [rows] = await conn.query(
    'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ?',
    [config.db.database],
  );
  if (rows.length === 0) return;
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const { name } of rows) await conn.query('DROP TABLE ??', [name]);
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
}

async function applySchema({ reset = false } = {}) {
  const conn = await connect();
  try {
    if (reset) await dropAllTables(conn);
    await conn.query(fs.readFileSync(SCHEMA_FILE, 'utf8'));
  } finally {
    await conn.end();
  }
}

module.exports = { applySchema };

if (require.main === module) {
  const command = process.argv[2];
  if (command !== 'init' && command !== 'reset') {
    console.error('Usage: node scripts/db.js <init|reset>');
    process.exit(1);
  }
  applySchema({ reset: command === 'reset' })
    .then(() => console.log(`Schema applied to ${config.db.database} (${command}).`))
    .catch((err) => {
      console.error(`Could not apply schema: ${err.message}`);
      process.exit(1);
    });
}
