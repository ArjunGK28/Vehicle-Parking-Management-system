// Creates the staff accounts and parking slots needed to try the app locally.
// Registration only creates drivers; administrators will manage users in story #28.
//   node scripts/seed.js
// Accounts come from SEED_* values in server/.env. Existing emails and slot codes are left untouched.
const config = require('../src/config');
const db = require('../src/db');
const users = require('../src/modules/users/users.repository');
const slots = require('../src/modules/slots/slots.repository');
const { hashPassword } = require('../src/modules/users/password');
const { ROLES } = require('../src/modules/users/roles');
const { SLOT_TYPES } = require('../src/modules/slots/slotTypes');

// P-01 to P-20 for cars, P-21 to P-30 for two-wheelers (Test Plan slot codes).
const demoSlots = Array.from({ length: 30 }, (_, i) => ({
  code: `P-${String(i + 1).padStart(2, '0')}`,
  type: i < 20 ? SLOT_TYPES.FOUR_WHEELER : SLOT_TYPES.TWO_WHEELER,
}));

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

  const existing = new Set((await slots.findAll()).map((slot) => slot.code));
  const missing = demoSlots.filter((slot) => !existing.has(slot.code));
  for (const slot of missing) await slots.create(slot);
  console.log(`Slots:   added ${missing.length}, ${existing.size} already existed`);
}

seed()
  .catch((err) => {
    console.error(`Seeding failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.end());
