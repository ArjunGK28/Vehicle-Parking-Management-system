const mysql = require('mysql2/promise');
const config = require('./config');

// One shared connection pool for every repository (data access layer).
const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

module.exports = pool;
