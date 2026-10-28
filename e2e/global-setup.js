// Runs once before all browser tests: checks the web client is built and rebuilds
// the parking_test tables from database/schema.sql.
require('./support/env');
const fs = require('node:fs');
const path = require('node:path');
const { applySchema } = require('../server/scripts/db');

module.exports = async () => {
  if (!fs.existsSync(path.join(__dirname, '..', 'client', 'dist', 'index.html'))) {
    throw new Error('The web client is not built. Run "npm run build" first (or use "npm run e2e").');
  }
  await applySchema({ reset: true });
};