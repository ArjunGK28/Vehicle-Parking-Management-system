// Issue #102: an attendant moves a parked vehicle to another free slot of its type.
const request = require('supertest');
const app = require('../../server/src/app');
const { ROLES } = require('../../server/src/modules/users/roles');
const { db, clearTables } = require('../helpers/db');
const { createUser, loginAs } = require('../helpers/users');
const { findIntegrityProblems } = require('../helpers/integrity');

const PLATE = 'KA01AB1234';
const OTHER_PLATE = 'KA02CD5678';
const BIKE_PLATE = 'KA03EF9012';

let admin;
let attendant;
let driver;
let slots;

beforeEach(async () => {
  await clearTables();
  admin = await loginAs(await createUser(ROLES.ADMIN));
  attendant = await loginAs(await createUser(ROLES.ATTENDANT));
  driver = await loginAs(await createUser(ROLES.DRIVER));

  for (const [registrationNumber, type] of [[PLATE, 'four_wheeler'], [OTHER_PLATE, 'four_wheeler'], [BIKE_PLATE, 'two_wheeler']]) {
    const vehicle = await driver.post('/api/vehicles').send({ registrationNumber, type, model: 'Test', colour: 'Red' });
    expect(vehicle.status).toBe(201);
  }
  expect((await admin.put('/api/rates/four_wheeler').send({ hourlyRate: 20, minimumFee: 10, billingStepMinutes: 15 })).status).toBe(200);

  slots = {};
  for (const [code, type] of [['P-01', 'four_wheeler'], ['P-02', 'four_wheeler'], ['P-03', 'four_wheeler'], ['B-01', 'two_wheeler']]) {
    const slot = await admin.post('/api/slots').send({ code, type });
    expect(slot.status).toBe(201);
    slots[code] = slot.body.slot.id;
  }
});

afterAll(() => db.end());

const enter = async (registrationNumber = PLATE) => {
  const res = await attendant.post('/api/parking/entry').send({ registrationNumber });
  expect(res.status).toBe(201);
  return res.body.session;
};
const move = (code, agent = attendant, registrationNumber = PLATE) =>
  agent.post('/api/parking/move').send({ registrationNumber, slotId: slots[code] });
const slotStatus = async (code) => (await attendant.get('/api/slots')).body.slots.find((s) => s.code === code).status;

describe('moving a parked vehicle', () => {
  test('the vehicle is in the new slot, and both slots show it straight away', async () => {
    await enter();

    const res = await move('P-02');

    expect(res.status).toBe(200);
    expect(res.body.session).toMatchObject({ registrationNumber: PLATE, fromSlotCode: 'P-01', slotCode: 'P-02', status: 'active' });
    expect(res.body.message).toBe(`Vehicle ${PLATE} moved from slot P-01 to slot P-02.`);
    expect(await slotStatus('P-01')).toBe('available');
    expect(await slotStatus('P-02')).toBe('occupied');

    const located = await attendant.get('/api/parking/locate').query({ registrationNumber: PLATE });
    expect(located.body.slot.code).toBe('P-02');
  });

  test('the registration number is normalised like everywhere else', async () => {
    await enter();

    const res = await move('P-02', attendant, ' ka01-ab 1234 ');

    expect(res.status).toBe(200);
    expect(res.body.session.registrationNumber).toBe(PLATE);
  });

  test('the same session continues, with the entry time unchanged', async () => {
    const session = await enter();
    await db.query('UPDATE parking_sessions SET entry_time = NOW() - INTERVAL 2 HOUR + INTERVAL 30 SECOND WHERE id = ?', [session.sessionId]);
    const [[before]] = await db.query('SELECT entry_time AS entryTime FROM parking_sessions WHERE id = ?', [session.sessionId]);

    const res = await move('P-02');

    expect(res.body.session.id).toBe(session.sessionId);
    const [rows] = await db.query('SELECT id, entry_time AS entryTime, status FROM parking_sessions');
    expect(rows).toEqual([{ id: session.sessionId, entryTime: before.entryTime, status: 'active' }]);
  });

  test('the fee is the same as if the vehicle had not moved, and paying frees the new slot', async () => {
    const session = await enter();
    await db.query('UPDATE parking_sessions SET entry_time = NOW() - INTERVAL 2 HOUR + INTERVAL 30 SECOND WHERE id = ?', [session.sessionId]);
    await move('P-02');

    const out = await attendant.post('/api/parking/exit').send({ registrationNumber: PLATE });
    expect(out.status).toBe(200);
    expect(out.body.session).toMatchObject({ slotCode: 'P-02', fee: 40 });
    expect(await slotStatus('P-02')).toBe('occupied');

    const paid = await attendant.post('/api/payments').send({ sessionId: out.body.session.id, method: 'cash' });
    expect(paid.status).toBe(201);
    expect(await slotStatus('P-02')).toBe('available');
    expect(await findIntegrityProblems()).toEqual([]);
  });

  test('the old slot can be given to the next vehicle', async () => {
    await enter();
    await move('P-02');

    expect((await enter(OTHER_PLATE)).slotCode).toBe('P-01');
  });
});

describe('only a free slot of the vehicle’s type can be chosen', () => {
  // Every refusal leaves the vehicle where it was.
  async function expectRefused(res, status, message) {
    expect(res.status).toBe(status);
    expect(res.body.error).toBe(message);
    const located = await attendant.get('/api/parking/locate').query({ registrationNumber: PLATE });
    expect(located.body.slot.code).toBe('P-01');
  }

  test('an occupied slot is refused (DR-03)', async () => {
    await enter();
    await enter(OTHER_PLATE); // P-02

    await expectRefused(await move('P-02'), 409, 'Slot P-02 is not free. Choose another slot.');
  });

  test('a slot waiting for payment is still occupied (UC-08)', async () => {
    await enter();
    await enter(OTHER_PLATE); // P-02
    expect((await attendant.post('/api/parking/exit').send({ registrationNumber: OTHER_PLATE })).status).toBe(200);

    await expectRefused(await move('P-02'), 409, 'Slot P-02 is not free. Choose another slot.');
  });

  test('a disabled slot is refused', async () => {
    await enter();
    expect((await admin.patch(`/api/slots/${slots['P-02']}`).send({ disabled: true })).status).toBe(200);

    await expectRefused(await move('P-02'), 409, 'Slot P-02 is not free. Choose another slot.');
  });

  test('a slot reserved for the current time is refused (DR-08)', async () => {
    await enter();
    await db.query(
      `INSERT INTO reservations (user_id, vehicle_id, slot_id, start_time, end_time)
       SELECT user_id, id, ?, NOW() - INTERVAL 1 HOUR, NOW() + INTERVAL 1 HOUR
       FROM vehicles WHERE registration_number = ?`,
      [slots['P-02'], OTHER_PLATE],
    );

    await expectRefused(await move('P-02'), 409, 'Slot P-02 is not free. Choose another slot.');
  });

  test('a slot of another type is refused (DR-07)', async () => {
    await enter();

    await expectRefused(await move('B-01'), 409, 'Slot B-01 is for a different vehicle type. Choose another slot.');
  });

  test('the slot the vehicle is already in is refused', async () => {
    await enter();

    await expectRefused(await move('P-01'), 409, `Vehicle ${PLATE} is already in slot P-01`);
  });

  test('a slot that does not exist is refused', async () => {
    await enter();

    const res = await attendant.post('/api/parking/move').send({ registrationNumber: PLATE, slotId: 999999 });

    await expectRefused(res, 404, 'Parking slot not found');
  });
});

describe('a vehicle that cannot be moved', () => {
  test('one that is not parked is refused', async () => {
    const res = await move('P-02');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('No active parking session found for this vehicle');
  });

  test('an unknown registration number gets the same answer', async () => {
    const res = await move('P-02', attendant, 'ZZ99ZZ9999');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('No active parking session found for this vehicle');
  });

  test('one waiting to pay is refused and stays in its slot', async () => {
    await enter();
    expect((await attendant.post('/api/parking/exit').send({ registrationNumber: PLATE })).status).toBe(200);

    const res = await move('P-02');

    expect(res.status).toBe(409);
    expect(res.body.error).toBe(`Exit is already recorded for ${PLATE}. Take payment instead of moving it.`);
    expect(await slotStatus('P-01')).toBe('occupied');
    expect(await slotStatus('P-02')).toBe('available');
  });

  test('one whose stay is over and paid is refused, so a past record cannot change (DR-10)', async () => {
    await enter();
    const out = await attendant.post('/api/parking/exit').send({ registrationNumber: PLATE });
    expect((await attendant.post('/api/payments').send({ sessionId: out.body.session.id, method: 'cash' })).status).toBe(201);

    const res = await move('P-02');

    expect(res.status).toBe(404);
    const [[row]] = await db.query('SELECT slot_id AS slotId FROM parking_sessions');
    expect(row.slotId).toBe(slots['P-01']);
  });
});

describe('invalid input', () => {
  test.each([undefined, null, '', 'abc', 0, -1, 1.5, '2'])('a slot of %p is refused with a field error', async (slotId) => {
    await enter();

    const res = await attendant.post('/api/parking/move').send({ registrationNumber: PLATE, slotId });

    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ slotId: 'Choose a slot' });
  });

  test('a missing registration number is refused with a field error', async () => {
    const res = await attendant.post('/api/parking/move').send({ slotId: slots['P-02'] });

    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ registrationNumber: 'Enter a registration number' });
  });
});

describe('two requests at the same time (NFR-04)', () => {
  test('two vehicles moving to the same slot cannot both get it', async () => {
    await enter();
    await enter(OTHER_PLATE); // P-02

    const results = await Promise.all([
      move('P-03'),
      move('P-03', attendant, OTHER_PLATE),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const [rows] = await db.query('SELECT COUNT(*) AS n FROM parking_sessions WHERE slot_id = ?', [slots['P-03']]);
    expect(rows[0].n).toBe(1);
  });

  test('a move and an entry cannot both get the same slot', async () => {
    await enter();
    // P-02 is disabled and P-03 is the only free slot.
    await admin.patch(`/api/slots/${slots['P-02']}`).send({ disabled: true });

    const [moved, entered] = await Promise.all([
      move('P-03'),
      attendant.post('/api/parking/entry').send({ registrationNumber: OTHER_PLATE }),
    ]);

    const [rows] = await db.query('SELECT slot_id AS slotId FROM parking_sessions');
    expect(new Set(rows.map((r) => r.slotId)).size).toBe(rows.length);
    expect(moved.status === 200 || entered.status === 201).toBe(true);
  });
});

describe('access', () => {
  test('a driver is refused with 403', async () => {
    await enter();

    const res = await move('P-02', driver);

    expect(res.status).toBe(403);
    expect(await slotStatus('P-01')).toBe('occupied');
  });

  test('an administrator is refused with 403', async () => {
    await enter();

    expect((await move('P-02', admin)).status).toBe(403);
  });

  test('without a session the move is refused with 401', async () => {
    const res = await request(app).post('/api/parking/move').send({ registrationNumber: PLATE, slotId: slots['P-02'] });

    expect(res.status).toBe(401);
  });
});
