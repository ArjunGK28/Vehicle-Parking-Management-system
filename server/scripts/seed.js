// Creates the staff accounts needed to try the attendant and admin screens locally.
// Registration only creates drivers; administrators will manage users in story #28.
//   node scripts/seed.js
// Accounts come from SEED_* values in server/.env. Existing emails are left untouched.
const config = require('../src/config');
const db = require('../src/db');
const users = require('../src/modules/users/users.repository');
const { hashPassword } = require('../src/modules/users/password');
const { ROLES } = require('../src/modules/users/roles');

const accounts = [
  {
    role: ROLES.ADMIN,
    name: 'Demo Administrator',
    email: process.env.SEED_ADMIN_EMAIL,
    password: process.env.SEED_ADMIN_PASSWORD,
  },
  {
    role: ROLES.ATTENDANT,
    name: 'Demo Attendant',
    email: process.env.SEED_ATTENDANT_EMAIL,
    password: process.env.SEED_ATTENDANT_PASSWORD,
  },
];

async function seed() {
  if (config.isProduction) throw new Error('Refusing to seed demo accounts in production');

  for (const account of accounts) {
    if (!account.email || !account.password) {
      console.log(`Skipped ${account.role}: set its SEED_* email and password in server/.env`);
      continue;
    }
    const email = account.email.trim().toLowerCase();
    if (await users.findByEmailWithHash(email)) {
      console.log(`Exists:  ${account.role} ${email}`);
      continue;
    }
    await users.create({
      name: account.name,
      email,
      passwordHash: await hashPassword(account.password),
      role: account.role,
    });
    console.log(`Created: ${account.role} ${email}`);
  }
}

seed()
  .catch((err) => {
    console.error(`Seeding failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.end());
