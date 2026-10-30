// Story #44 (FR-11, UC-11): drivers and administrators view parking history.
// Test IDs refer to the Test Case Document.
const request = require('supertest');
const app = require('../../server/src/app');
const { ROLES } = require('../../server/src/modules/users/roles');
const { db, clearTables } = require('../helpers/db');
const { createUser, loginAs } = require('../helpers/users');

let admin;
let attendant;
let driverUser;
let driver;
let otherDriver;
let vehicleId;
let otherVehicleId;
let slotId;

beforeEach(async () => {
  await clearTables();
  await db.query(
    "INSERT INTO parking_rates (slot_type, hourly_rate, minimum_fee, billing_step_minutes) VALUES ('four_wheeler', 20, 10, 15), ('two_wheeler', 10, 5, 15)",
  );

  admin = await loginAs(await createUser(ROLES.ADMIN));
  attendant = await loginAs(await createUser(ROLES.ATTENDANT));
  driverUser = await createUser(ROLES.DRIVER);
  driver = await loginAs(driverUser);
  otherDriver = await loginAs(await createUser(ROLES.DRIVER, { email: 'other@example.com' }));

  const car = await driver.post('/api/vehicles').send({ registrationNumber: 'KA01AB1234', type: 'four_wheeler', model: 'Swift', colour: 'Red' });
  const otherCar = await otherDriver.post('/api/vehicles').send({ registrationNumber: 'KA02CD5678', type: 'four_wheeler', model: 'i20', colour: 'Blue' });
  vehicleId = car.body.vehicle.id;
  otherVehicleId = otherCar.body.vehicle.id;

  const [slot] = await db.query("INSERT INTO parking_slots (code, slot_type) VALUES ('P-01', 'four_wheeler')");
  slotId = slot.insertId;
});

afterAll(() => db.end());

// A finished stay, as vehicle exit leaves it. Times are 'YYYY-MM-DD HH:MM:SS'.
async function completedSession({ vehicle = vehicleId, entry, exit, fee = 40, billed = 120, paymentStatus = 'unpaid' }) {
  const [result] = await db.query(
    `INSERT INTO parking_sessions (vehicle_id, slot_id, entry_time, exit_time, fee_amount, billed_minutes, status, payment_status)
     VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)`,
    [vehicle, slotId, entry, exit, fee, billed, paymentStatus],
  );
  return result.insertId;
}

describe('a driver views their own history', () => {
  test('UT-11_01: past completed sessions are listed with their fee and status, newest first', async () => {
    await completedSession({ entry: '2026-10-01 09:00:00', exit: '2026-10-01 11:00:00', fee: 40 });
    await completedSession({ entry: '2026-10-03 09:00:00', exit: '2026-10-03 09:45:00', fee: 15, billed: 45 });

    const res = await driver.get('/api/history');

    expect(res.status).toBe(200);
    expect(res.body.sessions.map((s) => s.fee)).toEqual([15, 40]);
    expect(res.body.sessions.every((s) => s.status === 'completed')).toBe(true);
    expect(res.body).toMatchObject({ page: 1, pageSize: 20, total: 2, totalPages: 1, totalFee: 55 });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('UT-11_02: each record shows vehicle, slot, entry, exit, duration, fee and status', async () => {
    const id = await completedSession({ entry: '2026-10-01 10:00:00', exit: '2026-10-01 12:15:00', fee: 45, billed: 135, paymentStatus: 'paid' });

    const res = await driver.get('/api/history');

    expect(res.body.sessions).toEqual([
      {
        id,
        vehicleId,
        registrationNumber: 'KA01AB1234',
        vehicleType: 'four_wheeler',
        slotCode: 'P-01',
        slotType: 'four_wheeler',
        entryTime: '2026-10-01 10:00:00',
        exitTime: '2026-10-01 12:15:00',
        durationSeconds: 8100,
        billedMinutes: 135,
        fee: 45,
        status: 'completed',
        paymentStatus: 'paid',
      },
    ]);
  });

  test('a stay recorded through entry, exit and payment appears in history with the fee shown on exit', async () => {
    const entry = await attendant.post('/api/parking/entry').send({ registrationNumber: 'KA01AB1234' });
    expect(entry.status).toBe(201);
    const exit = await attendant.post('/api/parking/exit').send({ registrationNumber: 'KA01AB1234' });
    expect(exit.status).toBe(200);
    const paid = await attendant.post('/api/payments').send({ sessionId: exit.body.session.id, method: 'cash' });
    expect(paid.status).toBe(201);

    const res = await driver.get('/api/history');

    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.sessions[0]).toMatchObject({
      id: exit.body.session.id,
      fee: exit.body.session.fee,
      status: 'completed',
      paymentStatus: 'paid',
      slotCode: 'P-01',
    });
  });

  test('a stay that has exited but is still waiting for payment is not history yet', async () => {
    expect((await attendant.post('/api/parking/entry').send({ registrationNumber: 'KA01AB1234' })).status).toBe(201);
    expect((await attendant.post('/api/parking/exit').send({ registrationNumber: 'KA01AB1234' })).status).toBe(200);

    const res = await driver.get('/api/history');

    expect(res.body.sessions).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  test('a stay that has not ended yet is not history', async () => {
    const entry = await attendant.post('/api/parking/entry').send({ registrationNumber: 'KA01AB1234' });
    expect(entry.status).toBe(201);

    const res = await driver.get('/api/history');

    expect(res.body.sessions).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  test("another driver's sessions are never shown", async () => {
    await completedSession({ entry: '2026-10-01 09:00:00', exit: '2026-10-01 10:00:00', fee: 20, billed: 60 });
    await completedSession({ vehicle: otherVehicleId, entry: '2026-10-02 09:00:00', exit: '2026-10-02 10:00:00', fee: 99, billed: 60 });

    const mine = await driver.get('/api/history');
    const theirs = await otherDriver.get('/api/history');

    expect(mine.body.sessions.map((s) => s.registrationNumber)).toEqual(['KA01AB1234']);
    expect(theirs.body.sessions.map((s) => s.registrationNumber)).toEqual(['KA02CD5678']);
    expect(mine.body.totalFee).toBe(20);
  });

  test('history keeps the vehicle after it is no longer parked, with no password or other user data', async () => {
    await completedSession({ entry: '2026-10-01 09:00:00', exit: '2026-10-01 10:00:00' });
    const res = await driver.get('/api/history');
    expect(JSON.stringify(res.body)).not.toMatch(/password|email/i);
  });
});

describe('past sessions cannot be edited (DR-10)', () => {
  test('IT-11_03: no route changes a session, and the record stays as it was', async () => {
    const id = await completedSession({ entry: '2026-10-01 09:00:00', exit: '2026-10-01 11:00:00', fee: 40 });
    const body = { fee: 1, feeAmount: 1, fee_amount: 1, exitTime: '2026-10-01 09:01:00', status: 'active' };

    for (const agent of [driver, admin, attendant]) {
      for (const [method, path] of [
        ['put', `/api/history/${id}`],
        ['patch', `/api/history/${id}`],
        ['delete', `/api/history/${id}`],
        ['post', '/api/history'],
        ['put', '/api/history'],
        ['delete', '/api/history'],
        ['patch', `/api/parking/sessions/${id}`],
        ['put', `/api/parking/sessions/${id}`],
      ]) {
        const res = await agent[method](path).send(body);
        expect([403, 404, 405]).toContain(res.status);
      }
    }

    const [[row]] = await db.query('SELECT status, fee_amount AS fee, exit_time AS exitTime FROM parking_sessions WHERE id = ?', [id]);
    expect(row).toEqual({ status: 'completed', fee: 40, exitTime: '2026-10-01 11:00:00' });
  });

  test('a completed session cannot be exited again to change its fee', async () => {
    await attendant.post('/api/parking/entry').send({ registrationNumber: 'KA01AB1234' });
    const first = await attendant.post('/api/parking/exit').send({ registrationNumber: 'KA01AB1234' });
    expect(first.status).toBe(200);
    expect((await attendant.post('/api/payments').send({ sessionId: first.body.session.id, method: 'cash' })).status).toBe(201);

    const again = await attendant.post('/api/parking/exit').send({ registrationNumber: 'KA01AB1234', exitTime: '2026-01-01 00:00' });

    expect(again.status).toBe(404);
    const history = await driver.get('/api/history');
    expect(history.body.sessions).toHaveLength(1);
    expect(history.body.sessions[0].fee).toBe(first.body.session.fee);
  });
});

describe('a new user', () => {
  test('IT-11_04: a user with no sessions gets an empty history, not an error', async () => {
    const fresh = await loginAs(await createUser(ROLES.DRIVER, { email: 'fresh@example.com' }));

    const res = await fresh.get('/api/history');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sessions: [], total: 0, totalPages: 0, totalFee: 0, page: 1 });
  });
});

describe('an administrator views any user’s history', () => {
  test('IT-11_05: the admin opens a driver’s history', async () => {
    await completedSession({ entry: '2026-10-01 09:00:00', exit: '2026-10-01 11:00:00', fee: 40 });
    await completedSession({ vehicle: otherVehicleId, entry: '2026-10-02 09:00:00', exit: '2026-10-02 10:00:00', fee: 20, billed: 60 });

    const res = await admin.get(`/api/history/users/${driverUser.id}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: driverUser.id, name: driverUser.name, email: driverUser.email, role: 'driver' });
    expect(res.body.sessions.map((s) => s.registrationNumber)).toEqual(['KA01AB1234']);
    expect(res.body).toMatchObject({ total: 1, totalFee: 40 });
  });

  test('a user with no sessions shows an empty history to the admin', async () => {
    const fresh = await createUser(ROLES.DRIVER, { email: 'fresh@example.com' });
    const res = await admin.get(`/api/history/users/${fresh.id}`);
    expect(res.status).toBe(200);
    expect(res.body.sessions).toEqual([]);
  });

  test.each(['999999', '1abc', '0'])('user id %p is not found', async (id) => {
    const res = await admin.get(`/api/history/users/${id}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('User not found');
  });
});

describe('a user with 50+ sessions', () => {
  const COUNT = 55;

  beforeEach(async () => {
    const rows = Array.from({ length: COUNT }, (_, i) => {
      const day = String((i % 28) + 1).padStart(2, '0');
      const hour = String(Math.floor(i / 28) * 3 + 8).padStart(2, '0');
      return [vehicleId, slotId, `2026-09-${day} ${hour}:00:00`, `2026-09-${day} ${hour}:30:00`, 10 + i, 30, 'completed', 'unpaid'];
    });
    await db.query(
      'INSERT INTO parking_sessions (vehicle_id, slot_id, entry_time, exit_time, fee_amount, billed_minutes, status, payment_status) VALUES ?',
      [rows],
    );
  });

  test('ST-11_06: paging through reaches every session once, without errors', async () => {
    const seen = [];
    for (let page = 1; page <= 3; page += 1) {
      const res = await driver.get('/api/history').query({ page });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ page, pageSize: 20, total: COUNT, totalPages: 3 });
      seen.push(...res.body.sessions.map((s) => s.id));
    }
    expect(seen).toHaveLength(COUNT);
    expect(new Set(seen).size).toBe(COUNT);
  });

  test('pages hold 20, 20 and 15 sessions, newest first', async () => {
    const pages = [];
    for (let page = 1; page <= 3; page += 1) pages.push((await driver.get('/api/history').query({ page })).body.sessions);
    expect(pages.map((p) => p.length)).toEqual([20, 20, 15]);

    const exits = pages.flat().map((s) => s.exitTime);
    expect(exits).toEqual([...exits].sort().reverse());
  });

  test('all sessions can be loaded in one request with a larger page size', async () => {
    const res = await driver.get('/api/history').query({ pageSize: 100 });
    expect(res.body.sessions).toHaveLength(COUNT);
    expect(res.body.totalPages).toBe(1);
  });

  test('the total fee covers every session, not just the current page', async () => {
    const expected = Array.from({ length: COUNT }, (_, i) => 10 + i).reduce((a, b) => a + b, 0);
    const res = await driver.get('/api/history').query({ pageSize: 5 });
    expect(res.body.totalFee).toBe(expected);
    expect(res.body.sessions).toHaveLength(5);
  });

  test('a page past the end is empty, not an error', async () => {
    const res = await driver.get('/api/history').query({ page: 9 });
    expect(res.status).toBe(200);
    expect(res.body.sessions).toEqual([]);
    expect(res.body.total).toBe(COUNT);
  });

  test('the admin can page through the same history', async () => {
    const res = await admin.get(`/api/history/users/${driverUser.id}`).query({ page: 3 });
    expect(res.body.sessions).toHaveLength(15);
  });
});

describe('input and access (NFR-11, NFR-15)', () => {
  test.each([
    [{ page: '0' }, 'page'],
    [{ page: 'abc' }, 'page'],
    [{ pageSize: '101' }, 'pageSize'],
    [{ pageSize: '0' }, 'pageSize'],
  ])('paging %p is refused with 400', async (query, field) => {
    const res = await driver.get('/api/history').query(query);
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields)).toEqual([field]);
  });

  test('without a session history is refused with 401', async () => {
    expect((await request(app).get('/api/history')).status).toBe(401);
    expect((await request(app).get(`/api/history/users/${driverUser.id}`)).status).toBe(401);
  });

  test('an attendant is refused with 403 on both routes', async () => {
    expect((await attendant.get('/api/history')).status).toBe(403);
    expect((await attendant.get(`/api/history/users/${driverUser.id}`)).status).toBe(403);
  });

  test('a driver cannot open another user’s history', async () => {
    await completedSession({ vehicle: otherVehicleId, entry: '2026-10-02 09:00:00', exit: '2026-10-02 10:00:00' });
    const res = await driver.get(`/api/history/users/${driverUser.id}`);
    expect(res.status).toBe(403);
  });

  test('the admin uses the per-user route, so /api/history itself is driver-only', async () => {
    expect((await admin.get('/api/history')).status).toBe(403);
  });
});