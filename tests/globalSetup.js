// Runs once before the whole test run: rebuilds the test database from schema.sql.
require('./setupEnv');
const { applySchema } = require('../server/scripts/db');

module.exports = async () => {
  await applySchema({ reset: true });
};
