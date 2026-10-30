// Issue #49: availability (NFR-03), reliability under simultaneous operations (NFR-06)
// and data integrity (NFR-09).
const request = require('supertest');
const app = require('../../server/src/app');
const { hashPassword } = require('../../server/src/modules/users/password');
const { ROLES } = require('../../server/src/modules/users/roles');
const { db, clearTables } = require('../helpers/db');
const { createUser, loginAs, TEST_PASSWORD } = require('../helpers/users');
const { findIntegrityProblems } = require('../helpers/integrity');

jest.setTimeout(120000);

const DRIVER_COUNT = 20;
const CAR_COUNT = 200;
const BIKE_COUNT = 30;
const CAR_SLOTS = 100;
const BIKE_SLOTS = 10; // fewer slots than bikes, so bikes always compete for slots

const carPlate = (n) => `KA01AB${String(n).padStart(4, '0')}`;
const bikePlate = (n) => `KA09TW${String(n).padStart(4, '0')}`;
const BIKES = Array.from({ length: BIKE_COUNT }, (_, i) => bikePlate(i + 1));

let server;
let admin;
let attendant;
let driver;
const vehicleIdByPlate = {};

const enter = (registrationNumber) => attendant.post('/api/parking/entry').send({ registrationNumber });
const exit = (registrationNumber) => attendant.post('/api/parking/exit').send({ registrationNumber });
// A vehicle leaves for good: exit is recorded, then cash completes the session and frees
// the slot (UC-08). Resolves with the exit response.
async function leave(registrationNumber) {
  const out = await exit(registrationNumber);
  if (out.status === 200) {
    const paid = await attendant.post('/api/payments').send({ sessionId: out.body.session.id, method: 'cash' });
    if (paid.status !== 201) throw new Error(`payment for ${registrationNumber} failed with ${paid.status}`);
  }
  return out;
}
const statuses = (responses) => responses.map((res) => res.status);
const count = (list, value) => list.filter((x) => x === value).length;

async function activeSessions() {
  const [rows] = await db.query(
    `SELECT s.id, s.slot_id AS slotId, v.registration_number AS plate
       FROM parking_sessions s JOIN vehicles v ON v.id = s.vehicle_id WHERE s.status = 'active'`,
  );
  return rows;
}

beforeAll(async () => {
  await clearTables();
  server = app.listen(0);

  await db.query(
    "INSERT INTO parking_rates (slot_type, hourly_rate, minimum_fee, billing_step_minutes) VALUES ('four_wheeler', 20, 10, 15), ('two_wheeler', 10, 5, 15)",
  );

  const passwordHash = await hashPassword(TEST_PASSWORD);
  await db.query('INSERT INTO users (name, email, password_hash, role) VALUES ?', [
    Array.from({ length: DRIVER_COUNT }, (_, i) => [`Driver ${i + 1}`, `driver${i + 1}@load.test`, passwordHash, 'driver']),
  ]);
  const [drivers] = await db.query("SELECT id FROM users WHERE role = 'driver' ORDER BY id");

  await db.query('INSERT INTO parking_slots (code, slot_type) VALUES ?', [
    [
      ...Array.from({ length: CAR_SLOTS }, (_, i) => [`S-${i + 1}`, 'four_wheeler']),
      ...Array.from({ length: BIKE_SLOTS }, (_, i) => [`T-${i + 1}`, 'two_wheeler']),
    ],
  ]);

  await db.query('INSERT INTO vehicles (user_id, registration_number, type, model, colour) VALUES ?', [
    [
      ...Array.from({ length: CAR_COUNT }, (_, i) => [drivers[i % DRIVER_COUNT].id, carPlate(i + 1), 'four_wheeler', 'Car', 'Grey']),
      ...Array.from({ length: BIKE_COUNT }, (_, i) => [drivers[i % DRIVER_COUNT].id, bikePlate(i + 1), 'two_wheeler', 'Bike', 'Black']),
    ],
  ]);
  const [vehicles] = await db.query('SELECT id, registration_number AS plate FROM vehicles');
  for (const v of vehicles) vehicleIdByPlate[v.plate] = v.id;

  admin = await loginAs(await createUser(ROLES.ADMIN), server);
  attendant = await loginAs(await createUser(ROLES.ATTENDANT), server);
  driver = await loginAs({ email: 'driver1@load.test', password: TEST_PASSWORD }, server);
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await clearTables();
  await db.end();
});

describe('availability (NFR-03)', () => {
  test('the health check reports the application and the database as up', async () => {
    const res = await request(server).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('the health check says down (503) when the database does not answer', async () => {
    const spy = jest.spyOn(db, 'query').mockRejectedValueOnce(new Error('connection lost'));
    try {
      const res = await request(server).get('/api/health');
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: 'down', database: 'down' });
    } finally {
      spy.mockRestore();
    }
  });

  test('a database error gives a clean 500 and the next request works again', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
    const spy = jest.spyOn(db, 'query').mockRejectedValueOnce(new Error('connection lost'));
    try {
      const failed = await attendant.get('/api/slots');
      expect(failed.status).toBe(500);
      expect(failed.body.error).toBe('Something went wrong. Please try again.');
      expect(JSON.stringify(failed.body)).not.toMatch(/connection lost/);
    } finally {
      spy.mockRestore();
      quiet.mockRestore();
    }
    expect((await attendant.get('/api/slots')).status).toBe(200);
  });

  test('99% of 600 mixed requests at 20 at a time are answered without a server error', async () => {
    const TOTAL = 600;
    const WORKERS = 20;
    const calls = [
      () => request(server).get('/api/health'),
      () => driver.get('/api/slots'),
      () => driver.get('/api/vehicles'),
      () => attendant.get(`/api/parking/locate?registrationNumber=${carPlate(1)}`),
      () => admin.get('/api/admin/users'),
      () => attendant.get('/api/slots?status=available'),
    ];
    const login = () => request(server).post('/api/auth/login').send({ email: 'driver2@load.test', password: TEST_PASSWORD });

    let next = 0;
    const results = [];
    async function worker() {
      while (next < TOTAL) {
        const i = next;
        next += 1;
        const call = i % 100 === 99 ? login : calls[i % calls.length];
        try {
          results.push((await call()).status);
        } catch {
          results.push(0); // no answer at all
        }
      }
    }
    await Promise.all(Array.from({ length: WORKERS }, worker));

    // A 4xx answer (for example "no active session found") is the server working as designed.
    const answered = results.filter((status) => status > 0 && status < 500).length;
    expect(results).toHaveLength(TOTAL);
    expect(answered / TOTAL).toBeGreaterThanOrEqual(0.99);
  });
});

describe('simultaneous operations keep slot and session data consistent (NFR-06)', () => {
  // Payments point at sessions, so they go first.
  beforeEach(async () => {
    await db.query('DELETE FROM payments');
    await db.query('DELETE FROM parking_sessions');
  });
  afterEach(async () => {
    expect(await findIntegrityProblems()).toEqual([]);
  });

  test('the same vehicle entering 10 times at once gets exactly one session', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => enter(carPlate(1))));

    expect(count(statuses(results), 201)).toBe(1);
    expect(count(statuses(results), 409)).toBe(9);
    expect(await activeSessions()).toHaveLength(1);
  });

  test('30 bikes entering at once for 10 slots: exactly 10 get a slot and no slot is given twice', async () => {
    const results = await Promise.all(BIKES.map((p) => enter(p)));

    expect(count(statuses(results), 201)).toBe(BIKE_SLOTS);
    expect(count(statuses(results), 409)).toBe(BIKE_COUNT - BIKE_SLOTS);

    const slotIds = results.filter((r) => r.status === 201).map((r) => r.body.session.slotId);
    expect(new Set(slotIds).size).toBe(BIKE_SLOTS);

    const list = await attendant.get('/api/slots').query({ type: 'two_wheeler' });
    expect(list.body.slots.every((s) => s.status === 'occupied')).toBe(true);
  });

  test('the same vehicle exiting 10 times at once records one exit, with one fee', async () => {
    expect((await enter(carPlate(2))).status).toBe(201);

    const results = await Promise.all(Array.from({ length: 10 }, () => exit(carPlate(2))));

    expect(count(statuses(results), 200)).toBe(1);
    expect(count(statuses(results), 409)).toBe(9); // already exited, waiting for payment
    const [rows] = await db.query("SELECT status, fee_amount AS fee FROM parking_sessions WHERE vehicle_id = ?", [vehicleIdByPlate[carPlate(2)]]);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('awaiting_payment');
    expect(rows[0].fee).toBeGreaterThan(0);
  });

    test('exit finishes even when every other database connection is busy (no pool starvation)', async () => {
    expect((await enter(carPlate(11))).status).toBe(201);

    // The pool has 10 connections. Hold 9, so the exit has only one connection to work with.
    // Exit must do all its work on that one connection; if it asks the pool for a second
    // one while holding the first, it waits forever (this is what ER_LOCK_WAIT_TIMEOUT was).
    const held = await Promise.all(Array.from({ length: 9 }, () => db.getConnection()));
    let timer;
    try {
      const outcome = await Promise.race([
        exit(carPlate(11)).then((res) => res.status),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve('stuck'), 5000);
        }),
      ]);
      expect(outcome).toBe(200);
    } finally {
      clearTimeout(timer);
      held.forEach((connection) => connection.release());
    }
  });

  test('3 rounds of bikes entering while others exit never double-book a slot or return a server error', async () => {
    const everything = [];
    for (let round = 0; round < 3; round += 1) {
      // All 30 bikes try to enter; 10 get slots.
      const firstWave = await Promise.all(BIKES.map((p, i) => enter(p).then((res) => ({ plate: BIKES[i], res }))));
      const parked = firstWave.filter((r) => r.res.status === 201).map((r) => r.plate);
      const refused = firstWave.filter((r) => r.res.status !== 201).map((r) => r.plate);
      everything.push(...firstWave.map((r) => r.res));

      // The parked ones leave (exit and pay) while the refused ones try again.
      const secondWave = await Promise.all([...parked.map((p) => leave(p)), ...refused.map((p) => enter(p))]);
      everything.push(...secondWave);
      expect(statuses(secondWave.slice(0, parked.length))).toEqual(parked.map(() => 200));

      const active = await activeSessions();
      expect(new Set(active.map((s) => s.slotId)).size).toBe(active.length);
      expect(active.length).toBeLessThanOrEqual(BIKE_SLOTS);
      expect(await findIntegrityProblems()).toEqual([]);

      // Everyone still parked leaves, ready for the next round.
      const leaving = await Promise.all(active.map((s) => leave(s.plate)));
      expect(statuses(leaving)).toEqual(active.map(() => 200));
    }

    expect(everything.filter((res) => res.status >= 500)).toEqual([]);
    expect(await activeSessions()).toEqual([]);
    const [[{ done }]] = await db.query("SELECT COUNT(*) AS done FROM parking_sessions WHERE status = 'completed'");
    expect(done).toBeGreaterThanOrEqual(3 * BIKE_SLOTS);
  });

  test('cars and bikes entering together each get a slot of their own type', async () => {
    const cars = Array.from({ length: 60 }, (_, i) => carPlate(i + 10));
    const results = await Promise.all([...cars, ...BIKES].map((p) => enter(p)));

    expect(count(statuses(results), 201)).toBe(60 + BIKE_SLOTS);
    expect(results.filter((res) => res.status >= 500)).toEqual([]);
  });

  test('the slot list agrees with the sessions: occupied slots = active sessions', async () => {
    await Promise.all(Array.from({ length: 25 }, (_, i) => enter(carPlate(i + 100))));

    const list = await driver.get('/api/slots');
    const active = await activeSessions();

    expect(active).toHaveLength(25);
    expect(list.body.counts.occupied).toBe(25);
    const { total, available, occupied, reserved, unavailable } = list.body.counts;
    expect(available + occupied + reserved + unavailable).toBe(total);
  });
});

describe('relationships stay accurate (NFR-09)', () => {
  // Payments point at sessions, so they go first.
  beforeEach(async () => {
    await db.query('DELETE FROM payments');
    await db.query('DELETE FROM parking_sessions');
  });

  test('a stay leaves a complete record: vehicle, slot, times, fee, then paid and completed', async () => {
    const entry = await enter(carPlate(3));
    const out = await exit(carPlate(3));
    expect(out.status).toBe(200);

    const [[row]] = await db.query(
      `SELECT s.vehicle_id AS vehicleId, s.slot_id AS slotId, s.status, s.exit_time AS exitTime,
              s.fee_amount AS fee, s.billed_minutes AS billed, s.payment_status AS paymentStatus
         FROM parking_sessions s WHERE s.id = ?`,
      [entry.body.session.sessionId],
    );
    expect(row).toMatchObject({
      vehicleId: vehicleIdByPlate[carPlate(3)],
      slotId: entry.body.session.slotId,
      status: 'awaiting_payment',
      fee: out.body.session.fee,
      paymentStatus: 'unpaid',
    });
    expect(row.exitTime).toBeTruthy();
    expect(await findIntegrityProblems()).toEqual([]);

    const paid = await attendant.post('/api/payments').send({ sessionId: out.body.session.id, method: 'cash' });
    expect(paid.status).toBe(201);
    const [[after]] = await db.query('SELECT status, payment_status AS paymentStatus FROM parking_sessions WHERE id = ?', [out.body.session.id]);
    expect(after).toEqual({ status: 'completed', paymentStatus: 'paid' });
    expect(await findIntegrityProblems()).toEqual([]);
  });

  test('the checker finds a slot with two vehicles in it when one is planted', async () => {
    const first = await enter(carPlate(4));
    expect(first.status).toBe(201);
    await db.query('INSERT INTO parking_sessions (vehicle_id, slot_id) VALUES (?, ?)', [vehicleIdByPlate[carPlate(5)], first.body.session.slotId]);

    const problems = await findIntegrityProblems();
    expect(problems).toEqual([expect.stringContaining('a slot has more than one vehicle on site')]);
  });

  test('the checker finds a wrong fee when one is planted', async () => {
    expect((await enter(carPlate(6))).status).toBe(201);
    expect((await exit(carPlate(6))).status).toBe(200);
    await db.query('UPDATE parking_sessions SET fee_amount = fee_amount + 7');

    expect(await findIntegrityProblems()).toEqual([expect.stringContaining('fee does not match the rate')]);
  });

  test('a session cannot point to a vehicle or slot that does not exist', async () => {
    const [[slot]] = await db.query('SELECT id FROM parking_slots LIMIT 1');
    await expect(db.query('INSERT INTO parking_sessions (vehicle_id, slot_id) VALUES (999999, ?)', [slot.id])).rejects.toMatchObject({
      code: 'ER_NO_REFERENCED_ROW_2',
    });
    await expect(
      db.query('INSERT INTO parking_sessions (vehicle_id, slot_id) VALUES (?, 999999)', [vehicleIdByPlate[carPlate(7)]]),
    ).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
  });

  test('a vehicle or slot with parking history cannot be deleted', async () => {
    const entry = await enter(carPlate(8));
    expect(entry.status).toBe(201);
    expect((await exit(carPlate(8))).status).toBe(200);

    await expect(db.query('DELETE FROM vehicles WHERE id = ?', [vehicleIdByPlate[carPlate(8)]])).rejects.toMatchObject({
      code: 'ER_ROW_IS_REFERENCED_2',
    });
    await expect(db.query('DELETE FROM parking_slots WHERE id = ?', [entry.body.session.slotId])).rejects.toMatchObject({
      code: 'ER_ROW_IS_REFERENCED_2',
    });
  });

  test('removing a user without history removes their vehicles and logins and leaves no orphans', async () => {
    const [[victim]] = await db.query("SELECT id FROM users WHERE email = 'driver5@load.test'");
    const [owned] = await db.query('SELECT COUNT(*) AS n FROM vehicles WHERE user_id = ?', [victim.id]);
    expect(owned[0].n).toBeGreaterThan(0);

    const res = await admin.delete(`/api/admin/users/${victim.id}`);

    expect(res.status).toBe(204);
    const [[left]] = await db.query('SELECT COUNT(*) AS n FROM vehicles WHERE user_id = ?', [victim.id]);
    expect(left.n).toBe(0);
    expect(await findIntegrityProblems()).toEqual([]);
  });

  test('removing a user with parking history is refused, so the history stays linked', async () => {
    const [[owner]] = await db.query('SELECT user_id AS id FROM vehicles WHERE registration_number = ?', [carPlate(9)]);
    expect((await enter(carPlate(9))).status).toBe(201);
    expect((await exit(carPlate(9))).status).toBe(200);

    const res = await admin.delete(`/api/admin/users/${owner.id}`);

    expect(res.status).toBe(409);
    expect(await findIntegrityProblems()).toEqual([]);
  });
});
