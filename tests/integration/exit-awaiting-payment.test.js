// UC-08 with a failed payment: exit is recorded and the fee fixed, UPI fails, the driver
// goes to fetch cash and comes back. Until the stay is paid the vehicle is still on site:
// it keeps its slot, cannot enter again, and staff can find it to take payment.
const request = require('supertest');
const app = require('../../server/src/app');
const { ROLES } = require('../../server/src/modules/users/roles');
const { db, clearTables } = require('../helpers/db');
const { createUser, loginAs } = require('../helpers/users');
const { findIntegrityProblems } = require('../helpers/integrity');

const PLATE = 'KA01AB1234';

let admin;
let attendant;
let driver;

beforeAll(async () => {
  await clearTables();
  admin = await loginAs(await createUser(ROLES.ADMIN));
  attendant = await loginAs(await createUser(ROLES.ATTENDANT));
  driver = await loginAs(await createUser(ROLES.DRIVER));

  const vehicle = await driver.post('/api/vehicles').send({ registrationNumber: PLATE, type: 'four_wheeler', model: 'Swift', colour: 'Red' });
  expect(vehicle.status).toBe(201);
  expect((await admin.put('/api/rates/four_wheeler').send({ hourlyRate: 20, minimumFee: 10, billingStepMinutes: 15 })).status).toBe(200);
  expect((await admin.post('/api/slots').send({ code: 'P-01', type: 'four_wheeler' })).status).toBe(201);
});

beforeEach(async () => {
  await db.query('DELETE FROM payments');
  await db.query('DELETE FROM parking_sessions');
});

afterAll(() => db.end());

const enter = () => attendant.post('/api/parking/entry').send({ registrationNumber: PLATE });
const exit = () => attendant.post('/api/parking/exit').send({ registrationNumber: PLATE });
const pay = (body) => attendant.post('/api/payments').send(body);
const slotStatus = async () => (await attendant.get('/api/slots')).body.slots.find((s) => s.code === 'P-01').status;

// Parks the vehicle as if it entered two hours ago, then records its exit (fee ₹40).
async function parkAndExit() {
  const entry = await enter();
  expect(entry.status).toBe(201);
  await db.query('UPDATE parking_sessions SET entry_time = NOW() - INTERVAL 2 HOUR + INTERVAL 30 SECOND WHERE id = ?', [
    entry.body.session.sessionId,
  ]);
  const out = await exit();
  expect(out.status).toBe(200);
  expect(out.body.session).toMatchObject({ fee: 40, status: 'awaiting_payment', paymentStatus: 'unpaid' });
  return out.body.session;
}

describe('UPI fails at the exit, the driver pays cash later', () => {
  test('the whole visit: exit, failed UPI, wait, cash, slot released, vehicle can come back', async () => {
    const session = await parkAndExit();

    // UPI fails at the gate.
    const upi = await pay({ sessionId: session.id, method: 'upi', upiId: 'failure@upi' });
    expect(upi.status).toBe(402);

    // While the driver fetches cash, the vehicle is still on site.
    expect(await slotStatus()).toBe('occupied');
    const located = await attendant.get('/api/parking/locate').query({ registrationNumber: PLATE });
    expect(located.status).toBe(200);
    expect(located.body.session).toMatchObject({ id: session.id, status: 'awaiting_payment' });
    expect(located.body.message).toBe(`Vehicle ${PLATE} is in slot P-01, waiting to pay for its stay.`);

    const waiting = await attendant.get('/api/payments/awaiting');
    expect(waiting.body.sessions).toEqual([expect.objectContaining({ id: session.id, fee: 40, failedAttempts: 1 })]);

    // The driver comes back with cash. The fee is the one fixed at exit.
    const cash = await pay({ sessionId: session.id, method: 'cash' });
    expect(cash.status).toBe(201);
    expect(cash.body.payment).toMatchObject({ amount: 40, method: 'cash', status: 'paid' });

    // Now the session is complete, the slot is free and the vehicle may visit again.
    expect(await slotStatus()).toBe('available');
    expect((await attendant.get('/api/payments/awaiting')).body.sessions).toEqual([]);
    expect((await attendant.get('/api/parking/locate').query({ registrationNumber: PLATE })).status).toBe(404);
    expect((await enter()).status).toBe(201);
    expect(await findIntegrityProblems()).toEqual([]);
  });

  test('a vehicle that has not paid cannot enter again', async () => {
    await parkAndExit();

    const res = await enter();

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('This vehicle has not paid for its last stay yet. Take payment before it enters again.');
  });

  test('a slot held by a vehicle waiting to pay is not given to another vehicle', async () => {
    await parkAndExit();
    const other = await driver.post('/api/vehicles').send({ registrationNumber: 'KA05XY9999', type: 'four_wheeler', model: 'i20', colour: 'Blue' });
    expect(other.status).toBe(201);

    const res = await attendant.post('/api/parking/entry').send({ registrationNumber: 'KA05XY9999' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('No suitable parking slot is currently available');
    await db.query('DELETE FROM vehicles WHERE id = ?', [other.body.vehicle.id]);
  });

  test('the driver can also pay from their own Payments page while waiting', async () => {
    const session = await parkAndExit();

    const unpaid = await driver.get('/api/payments/unpaid');
    expect(unpaid.body.sessions.map((s) => s.id)).toEqual([session.id]);

    const res = await driver.post('/api/payments').send({ sessionId: session.id, method: 'upi', upiId: 'arjun@okaxis' });
    expect(res.status).toBe(201);
    expect(await slotStatus()).toBe('available');
  });

  test('visitors cannot see who is waiting to pay', async () => {
    expect((await request(app).get('/api/payments/awaiting')).status).toBe(401);
  });
});
