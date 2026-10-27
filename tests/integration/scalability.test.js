// Issue #48 (NFR-04): the system is tested with 500 slots and 5,000 vehicles,
// and handles 100 concurrent users.
const request = require('supertest');
const app = require('../../server/src/app');
const { hashPassword } = require('../../server/src/modules/users/password');
const { ROLES } = require('../../server/src/modules/users/roles');
const { db, clearTables } = require('../helpers/db');
const { createUser, loginAs, TEST_PASSWORD } = require('../helpers/users');

jest.setTimeout(180000); // seeding and 100 real bcrypt logins take a few seconds

const SLOT_COUNT = 500;
const VEHICLE_COUNT = 5000;
const USER_COUNT = 100;
const VEHICLES_PER_USER = VEHICLE_COUNT / USER_COUNT;
const FOUR_WHEELER_SLOTS = 400; // the other 100 are two-wheeler slots
const LIMIT_MS = 2000; // NFR-01: 95% of requests within 2 seconds

let server;
let drivers; // [{ id, email, agent, vehicleIds }]
let attendant;
let loginMs;

const p95 = (values) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];

// Runs fn(i) for every user at the same moment and returns each call's own duration.
async function allAtOnce(fn) {
  const results = await Promise.all(
    drivers.map(async (driver, i) => {
      const start = Date.now();
      const res = await fn(driver, i);
      return { res, ms: Date.now() - start };
    }),
  );
  return { responses: results.map((r) => r.res), durations: results.map((r) => r.ms) };
}

beforeAll(async () => {
  await clearTables();
  server = app.listen(0);

  // 100 drivers (one shared hash, so seeding is quick).
  const passwordHash = await hashPassword(TEST_PASSWORD);
  await db.query('INSERT INTO users (name, email, password_hash, role) VALUES ?', [
    Array.from({ length: USER_COUNT }, (_, i) => [`Load Driver ${i + 1}`, `driver${i + 1}@load.test`, passwordHash, 'driver']),
  ]);
  const [userRows] = await db.query("SELECT id, email FROM users WHERE role = 'driver' ORDER BY id");

  // 500 slots: S-1..S-400 four-wheeler, S-401..S-500 two-wheeler.
  await db.query('INSERT INTO parking_slots (code, slot_type) VALUES ?', [
    Array.from({ length: SLOT_COUNT }, (_, i) => [`S-${i + 1}`, i < FOUR_WHEELER_SLOTS ? 'four_wheeler' : 'two_wheeler']),
  ]);

  // 5,000 vehicles, 50 per driver. Each driver's first vehicle is a four-wheeler.
  const vehicleRows = [];
  userRows.forEach((user, u) => {
    for (let j = 0; j < VEHICLES_PER_USER; j += 1) {
      const n = u * VEHICLES_PER_USER + j + 1;
      vehicleRows.push([user.id, `KA01AB${String(n).padStart(4, '0')}`, j % 5 === 4 ? 'two_wheeler' : 'four_wheeler', 'Load Test', 'Grey']);
    }
  });
  await db.query('INSERT INTO vehicles (user_id, registration_number, type, model, colour) VALUES ?', [vehicleRows]);

  const [vehicles] = await db.query('SELECT id, user_id FROM vehicles ORDER BY id');
  const idsByUser = new Map();
  for (const v of vehicles) {
    if (!idsByUser.has(v.user_id)) idsByUser.set(v.user_id, []);
    idsByUser.get(v.user_id).push(v.id);
  }

  attendant = await loginAs(await createUser(ROLES.ATTENDANT), server);

  // All 100 drivers log in at the same moment (real bcrypt checks).
  const start = Date.now();
  drivers = await Promise.all(
    userRows.map(async (user) => ({
      id: user.id,
      email: user.email,
      vehicleIds: idsByUser.get(user.id),
      agent: await loginAs({ email: user.email, password: TEST_PASSWORD }, server),
    })),
  );
  loginMs = Date.now() - start;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await clearTables();
  await db.end();
});

describe('test data volume', () => {
  test('the database holds 500 slots and 5,000 vehicles', async () => {
    const [[slots]] = await db.query('SELECT COUNT(*) AS count FROM parking_slots');
    const [[vehicles]] = await db.query('SELECT COUNT(*) AS count FROM vehicles');
    expect(slots.count).toBe(SLOT_COUNT);
    expect(vehicles.count).toBe(VEHICLE_COUNT);
  });
});

describe('100 concurrent users', () => {
  test('all 100 users log in at the same time and get a session', async () => {
    expect(drivers).toHaveLength(USER_COUNT);
    const [[{ count }]] = await db.query("SELECT COUNT(*) AS count FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE u.role = 'driver'");
    expect(count).toBe(USER_COUNT);
    expect(loginMs).toBeLessThan(30000);
  });

  test('all 100 users view the 500-slot list at once, 3 rounds, p95 under 2 seconds', async () => {
    const durations = [];
    for (let round = 0; round < 3; round += 1) {
      const out = await allAtOnce((driver) => driver.agent.get('/api/slots'));
      for (const res of out.responses) {
        expect(res.status).toBe(200);
        expect(res.body.slots).toHaveLength(SLOT_COUNT);
        expect(res.body.counts.total).toBe(SLOT_COUNT);
      }
      durations.push(...out.durations);
    }
    expect(p95(durations)).toBeLessThan(LIMIT_MS);
  });

  test('all 100 users load their own 50 vehicles at once, p95 under 2 seconds', async () => {
    const out = await allAtOnce((driver) => driver.agent.get('/api/vehicles'));
    out.responses.forEach((res, i) => {
      expect(res.status).toBe(200);
      expect(res.body.vehicles).toHaveLength(VEHICLES_PER_USER);
      expect(res.body.vehicles.every((v) => v.userId === drivers[i].id)).toBe(true);
    });
    expect(p95(out.durations)).toBeLessThan(LIMIT_MS);
  });

  test('100 users park a vehicle at the same moment: every one gets a different slot', async () => {
    const out = await allAtOnce((driver) => driver.agent.post('/api/parking/assign').send({ vehicleId: driver.vehicleIds[0] }));

    // Show the server's message if any assignment failed.
    const failed = out.responses.filter((res) => res.status !== 201).map((res) => `${res.status} ${res.body.error || res.body.message}`);
    expect(failed).toEqual([]);

    const slotIds = out.responses.map((res) => res.body.session.slotId);
    expect(new Set(slotIds).size).toBe(USER_COUNT); // no slot given twice

    const [duplicates] = await db.query(
      "SELECT slot_id, COUNT(*) AS sessions FROM parking_sessions WHERE status = 'active' GROUP BY slot_id HAVING sessions > 1",
    );
    expect(duplicates).toEqual([]);

    const [[{ active }]] = await db.query("SELECT COUNT(*) AS active FROM parking_sessions WHERE status = 'active'");
    expect(active).toBe(USER_COUNT);
    expect(p95(out.durations)).toBeLessThan(LIMIT_MS);
  });

  test('the slot list shows the 100 new sessions as Occupied', async () => {
    const res = await drivers[0].agent.get('/api/slots');
    expect(res.status).toBe(200);
    expect(res.body.counts).toMatchObject({ total: SLOT_COUNT, occupied: USER_COUNT, available: SLOT_COUNT - USER_COUNT });
  });

  test('100 concurrent lookups find the right slot among 5,000 vehicles', async () => {
    const [sessions] = await db.query(
      `SELECT v.registration_number AS registrationNumber, s.slot_id AS slotId
         FROM parking_sessions s JOIN vehicles v ON v.id = s.vehicle_id
        WHERE s.status = 'active'`,
    );
    expect(sessions).toHaveLength(USER_COUNT);

    const results = await Promise.all(
      sessions.map(async (session) => {
        const start = Date.now();
        const res = await attendant.get('/api/parking/locate').query({ registrationNumber: session.registrationNumber });
        return { res, session, ms: Date.now() - start };
      }),
    );

    for (const { res, session } of results) {
      expect(res.status).toBe(200);
      expect(res.body.slot.id).toBe(session.slotId);
    }
    expect(p95(results.map((r) => r.ms))).toBeLessThan(LIMIT_MS);
  });

  test('a mix of 100 users (browsing, searching and parking) all succeed together', async () => {
    const out = await allAtOnce((driver, i) => {
      if (i % 3 === 0) return driver.agent.get('/api/slots').query({ status: 'available' });
      if (i % 3 === 1) return driver.agent.get('/api/vehicles');
      return driver.agent.post('/api/parking/assign').send({ vehicleId: driver.vehicleIds[1] });
    });

    // Parking again: the second vehicle (a four-wheeler) of those users has no session yet.
    out.responses.forEach((res, i) => {
      expect(res.status).toBe(i % 3 === 2 ? 201 : 200);
    });
    expect(p95(out.durations)).toBeLessThan(LIMIT_MS);

    const [duplicates] = await db.query(
      "SELECT slot_id FROM parking_sessions WHERE status = 'active' GROUP BY slot_id HAVING COUNT(*) > 1",
    );
    expect(duplicates).toEqual([]);
  });
});