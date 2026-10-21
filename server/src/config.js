const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');

// Load server/.env without overriding variables that are already set,
// so tests and CI can point the server at a different database.
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  const values = parseEnv(fs.readFileSync(envFile, 'utf8'));
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const env = process.env.NODE_ENV || 'development';

module.exports = {
  env,
  isProduction: env === 'production',
  port: Number(process.env.PORT) || 4000,
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'parking_app',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'parking_dev',
  },
  // NFR-13: 5 consecutive failed logins lock the account for a while.
  lockout: {
    maxAttempts: 5,
    durationMinutes: Number(process.env.LOCKOUT_MINUTES) || 15,
  },
};