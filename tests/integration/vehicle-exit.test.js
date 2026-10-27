// Stories #66 (FR-08, NFR-02) and #68 (FR-09): the attendant records exit and the fee
// is calculated on exit.
const request = require('supertest');
const app = require('../../server/src/app');
const { ROLES } = require('../../server/src/modules/users/roles');
const { db, clearTables } = require('../helpers/db');
const { createUser, loginAs } = require('../helpers/users');

let admin;
let attendant;
let driver;
const vehicleIds = {};

beforeAll(async () => {
  await clearTables();
  admin = await loginAs(await createUser(ROLES.ADMIN));
  attendant = await loginAs(await createUser(ROLES.ATTENDANT));
  driver = await loginAs(await createUser(ROLES.DRIVER));

  for (const registrationNumber of ['KA01AB1234', 'KA02CD5678']) {
    const res = await driver.post('/api/vehicles').send({ registrationNumber, type: 'four_wheeler', model: 'Test', colour: 'White' });
    expect(res.status).toBe(201);
    vehicleIds[registrationNumber] = res.body.vehicle.id;
  }
});

beforeEach(async () => {
  await db.query('DELETE FROM parking_sessions');
  await db.query('DELETE FROM parking_slots');
  await setRate({ hourlyRate: 20, minimumFee: 10, billingStepMinutes: 15 });
});

afterAll(() => db.end());

// clearTables() empties parking_rates, so every test sets the rate it needs.
async function setRate(rate) {
  const res = await admin.put('/api/rates/four_wheeler').send(rate);
  expect(res.status).toBe(200);
}

// Parks the vehicle in a new slot with the given entry time, which is either a fixed
// 'YYYY-MM-DD HH:MM:SS' or a number of seconds before now.
async function park(registrationNumber, slotCode, entry) {
  const slotRes = await admin.post('/api/slots').send({ code: slotCode, type: 'four_wheeler' });
  expect(slotRes.status).toBe(201);

  const entrySql = typeof entry === 'number' ? 'NOW() - INTERVAL ? SECOND' : '?';
  const [result] = await db.query(
    `INSERT INTO parking_sessions (vehicle_id, slot_id, entry_time) VALUES (?, ?, ${entrySql})`,
    [vehicleIds[registrationNumber], slotRes.body.slot.id, entry],
  );
  return result.insertId;
}

const exit = (body, agent = attendant) => agent.post('/api/parking/exit').send(body);

async function sessionRow(id) {
  const [rows] = await db.query(
    `SELECT status, exit_time AS exitTime, fee_amount AS feeAmount,
            billed_minutes AS billedMinutes, payment_status AS paymentStatus
     FROM parking_sessions WHERE id = ?`,
    [id],
  );
  return rows[0];
}

const slotStatus = async (code) =>
  (await attendant.get('/api/slots')).body.slots.find((s) => s.code === code).status;

describe('recording exit (FR-08)', () => {
  test('UT-08_01: exit records the time and completes the session', async () => {
    // Just under 2 hours ago, so the stay bills 120 minutes even if a second passes.
    const sessionId = await park('KA01AB1234', 'P-08', 2 * 3600 - 30);

    const res = await exit({ registrationNumber: 'ka 01 ab-1234' });

    expect(res.status).toBe(200);
    expect(res.body.session).toMatchObject({
      id: sessionId,
      vehicleId: vehicleIds.KA01AB1234,
      registrationNumber: 'KA01AB1234',
      slotCode: 'P-08',
      slotType: 'four_wheeler',
      billedMinutes: 120,
      fee: 40,
      paymentStatus: 'unpaid',
      status: 'completed',
    });
    expect(res.body.session.exitTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(res.body.message).toBe('Vehicle KA01AB1234 has exited slot P-08. Fee: ₹40.');

    expect(await sessionRow(sessionId)).toEqual({
      status: 'completed',
      exitTime: res.body.session.exitTime,
      feeAmount: 40,
      billedMinutes: 120,
      paymentStatus: 'unpaid',
    });
  });

  test('UT-08_02: the slot is released to Available after exit (SYS-12)', async () => {
    await park('KA01AB1234', 'P-08', 600);
    expect(await slotStatus('P-08')).toBe('occupied');

    expect((await exit({ registrationNumber: 'KA01AB1234' })).status).toBe(200);

    expect(await slotStatus('P-08')).toBe('available');
  });

  test('IT-08_03: exit is blocked when there is no active session (DR-04)', async () => {
    const unknown = await exit({ registrationNumber: 'KA09ZZ0000' });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toBe('No active parking session found for this vehicle');

    // A registered vehicle that is not parked gets the same answer.
    const notParked = await exit({ registrationNumber: 'KA02CD5678' });
    expect(notParked.status).toBe(404);
    expect(notParked.body.error).toBe('No active parking session found for this vehicle');
  });

  test('IT-08_04: an exit time before the entry time is rejected (DR-09)', async () => {
    const sessionId = await park('KA01AB1234', 'P-08', '2026-10-20 17:00:00');

    const res = await exit({ registrationNumber: 'KA01AB1234', exitTime: '2026-10-20 15:00' });

    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ exitTime: 'Exit time cannot be before the entry time' });
    expect((await sessionRow(sessionId)).status).toBe('active');
  });

  test('IT-08_05: exit calculates the fee before the session is completed', async () => {
    const sessionId = await park('KA01AB1234', 'P-08', '2026-10-20 10:00:00');

    const res = await exit({ registrationNumber: 'KA01AB1234', exitTime: '2026-10-20 12:00' });

    expect(res.status).toBe(200);
    expect(res.body.session).toMatchObject({ entryTime: '2026-10-20 10:00:00', exitTime: '2026-10-20 12:00:00', fee: 40 });
    // The fee is saved in the same update that completes the session.
    expect(await sessionRow(sessionId)).toMatchObject({ status: 'completed', feeAmount: 40, billedMinutes: 120 });
  });

  test('ST-08_06: a completed session cannot be changed by another exit (DR-10)', async () => {
    const sessionId = await park('KA01AB1234', 'P-08', '2026-10-20 10:00:00');
    expect((await exit({ registrationNumber: 'KA01AB1234', exitTime: '2026-10-20 12:00' })).status).toBe(200);
    const before = await sessionRow(sessionId);

    const again = await exit({ registrationNumber: 'KA01AB1234', exitTime: '2026-10-20 18:00' });

    expect(again.status).toBe(404);
    expect(again.body.error).toBe('No active parking session found for this vehicle');
    expect(await sessionRow(sessionId)).toEqual(before);
  });

  test('two exits at the same moment complete the session only once', async () => {
    const sessionId = await park('KA01AB1234', 'P-08', 3600);

    const results = await Promise.all([
      exit({ registrationNumber: 'KA01AB1234' }),
      exit({ registrationNumber: 'KA01AB1234' }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 404]);
    expect((await sessionRow(sessionId)).status).toBe('completed');
  });
});

describe('exit input and access', () => {
  test('an exit time in the future is rejected', async () => {
    await park('KA01AB1234', 'P-08', 600);

    const res = await exit({ registrationNumber: 'KA01AB1234', exitTime: '2099-01-01 10:00' });

    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ exitTime: 'Exit time cannot be in the future' });
  });

  test.each([
    ['not a date', 'yesterday'],
    ['an impossible date', '2026-02-30 10:00'],
    ['a number', 1730000000],
  ])('an exit time that is %s is rejected', async (_label, exitTime) => {
    await park('KA01AB1234', 'P-08', 600);

    const res = await exit({ registrationNumber: 'KA01AB1234', exitTime });

    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ exitTime: 'Enter the exit time as YYYY-MM-DD HH:MM' });
  });

  test('a missing registration number is rejected', async () => {
    const res = await exit({});

    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ registrationNumber: 'Enter a registration number' });
  });

  test('an administrator can record exit', async () => {
    await park('KA01AB1234', 'P-08', 600);

    expect((await exit({ registrationNumber: 'KA01AB1234' }, admin)).status).toBe(200);
  });

  test('a driver cannot record exit, and a visitor must log in', async () => {
    await park('KA01AB1234', 'P-08', 600);

    expect((await exit({ registrationNumber: 'KA01AB1234' }, driver)).status).toBe(403);
    expect((await request(app).post('/api/parking/exit').send({ registrationNumber: 'KA01AB1234' })).status).toBe(401);
  });
});

describe('fee on exit (FR-09)', () => {
  test('UT-09_01: 10:00 to 12:00 at ₹20/hr costs ₹40', async () => {
    await park('KA01AB1234', 'P-08', '2026-10-20 10:00:00');

    const res = await exit({ registrationNumber: 'KA01AB1234', exitTime: '2026-10-20 12:00' });

    expect(res.body.session).toMatchObject({ billedMinutes: 120, fee: 40 });
  });

  test('UT-09_02: 10:00 to 10:45 at ₹20/hr is rounded up to the 30-minute billing step', async () => {
    await setRate({ hourlyRate: 20, minimumFee: 10, billingStepMinutes: 30 });
    await park('KA01AB1234', 'P-08', '2026-10-20 10:00:00');

    const res = await exit({ registrationNumber: 'KA01AB1234', exitTime: '2026-10-20 10:45' });

    expect(res.body.session).toMatchObject({ billedMinutes: 60, fee: 20 });
  });

  test('IT-09_03: 1.5 hours at ₹30/hr costs ₹45', async () => {
    await setRate({ hourlyRate: 30, minimumFee: 10, billingStepMinutes: 15 });
    await park('KA01AB1234', 'P-08', '2026-10-20 10:00:00');

    const res = await exit({ registrationNumber: 'KA01AB1234', exitTime: '2026-10-20 11:30' });

    expect(res.body.session).toMatchObject({ billedMinutes: 90, fee: 45 });
  });

  test('IT-09_04: entry and exit at the same time cost the minimum fee, with no error', async () => {
    await park('KA01AB1234', 'P-08', '2026-10-20 10:00:00');

    const res = await exit({ registrationNumber: 'KA01AB1234', exitTime: '2026-10-20 10:00' });

    expect(res.status).toBe(200);
    expect(res.body.session).toMatchObject({ billedMinutes: 0, fee: 10 });
  });

  test('IT-09_05: a new exit uses the rate as changed (admin side: IT-12_04)', async () => {
    await park('KA01AB1234', 'P-08', '2026-10-20 10:00:00');
    await park('KA02CD5678', 'P-09', '2026-10-20 10:00:00');

    const before = await exit({ registrationNumber: 'KA01AB1234', exitTime: '2026-10-20 12:00' });
    await setRate({ hourlyRate: 40, minimumFee: 10, billingStepMinutes: 15 });
    const after = await exit({ registrationNumber: 'KA02CD5678', exitTime: '2026-10-20 12:00' });

    expect(before.body.session.fee).toBe(40);
    expect(after.body.session.fee).toBe(80);
  });

  test('ST-09_06: the fee is shown within the 3-second exit flow (NFR-02)', async () => {
    await park('KA01AB1234', 'P-08', 3600);

    const started = Date.now();
    const res = await exit({ registrationNumber: 'KA01AB1234' });
    const elapsed = Date.now() - started;

    expect(res.status).toBe(200);
    expect(res.body.session.fee).toEqual(expect.any(Number));
    expect(elapsed).toBeLessThan(3000);
  });
});