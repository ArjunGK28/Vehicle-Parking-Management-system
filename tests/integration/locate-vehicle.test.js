// Issue #64 (FR-07, UC-07): attendants and admins locate a parked vehicle.
const request = require('supertest');
const app = require('../../server/src/app');
const vehicles = require('../../server/src/modules/vehicles/vehicles.repository');
const { ROLES } = require('../../server/src/modules/users/roles');
const { db, clearTables } = require('../helpers/db');
const { createUser, loginAs } = require('../helpers/users');

const PLATE = 'KA01AB1234';

let driverUser;
let driver;
let attendant;
let admin;
let vehicle;

beforeEach(async () => {
  await clearTables();
  driverUser = await createUser(ROLES.DRIVER);
  driver = await loginAs(driverUser);
  attendant = await loginAs(await createUser(ROLES.ATTENDANT));
  admin = await loginAs(await createUser(ROLES.ADMIN));
  vehicle = await vehicles.create({
    userId: driverUser.id,
    registrationNumber: PLATE,
    type: 'four_wheeler',
    model: 'Test Car',
    colour: 'White',
  });
});

afterAll(() => db.end());

async function addSlot(code, type = 'four_wheeler') {
  const res = await admin.post('/api/slots').send({ code, type });
  expect(res.status).toBe(201);
  return res.body.slot;
}

// Parks the vehicle through the real assignment endpoint.
async function park(vehicleId = vehicle.id) {
  const res = await driver.post('/api/parking/assign').send({ vehicleId });
  expect(res.status).toBe(201);
  return res.body.session;
}

const locate = (agent, registrationNumber) =>
  agent.get('/api/parking/locate').query(registrationNumber === undefined ? {} : { registrationNumber });

describe('searching for a parked vehicle', () => {
  test('UT-07_01: an attendant gets the vehicle’s slot and status', async () => {
    await addSlot('P-1');
    const session = await park();

    const res = await locate(attendant, PLATE);

    expect(res.status).toBe(200);
    expect(res.body.vehicle).toMatchObject({ id: vehicle.id, registrationNumber: PLATE, model: 'Test Car', colour: 'White' });
    expect(res.body.slot).toMatchObject({ code: 'P-1', type: 'four_wheeler', status: 'occupied' });
    expect(res.body.session).toMatchObject({ id: session.sessionId, status: 'active' });
    expect(res.body.session.entryTime).toBeTruthy();
    expect(res.body.message).toBe(`Vehicle ${PLATE} is in slot P-1.`);
  });

  test('UT-07_02: an administrator can search too', async () => {
    await addSlot('P-1');
    await park();
    const res = await locate(admin, PLATE);
    expect(res.status).toBe(200);
    expect(res.body.slot.code).toBe('P-1');
  });

  test('the search ignores case and surrounding spaces', async () => {
    await addSlot('P-1');
    await park();
    const res = await locate(attendant, ' ka01ab1234 ');
    expect(res.status).toBe(200);
    expect(res.body.vehicle.registrationNumber).toBe(PLATE);
  });

  test('the answer is never cached', async () => {
    await addSlot('P-1');
    await park();
    const res = await locate(attendant, PLATE);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('the result shows the slot’s current status, e.g. Unavailable if an admin disabled it', async () => {
    const slot = await addSlot('P-1');
    await park();
    await admin.patch(`/api/slots/${slot.id}`).send({ disabled: true });
    const res = await locate(attendant, PLATE);
    expect(res.body.slot.status).toBe('unavailable');
  });
});

describe('a vehicle that is not parked', () => {
  test('IT-07_03: a registered vehicle with no session returns "no active session found"', async () => {
    const res = await locate(attendant, PLATE);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('No active parking session found for this vehicle');
  });

  test('a vehicle whose session is completed returns "no active session found"', async () => {
    await addSlot('P-1');
    const session = await park();
    await db.query("UPDATE parking_sessions SET status = 'completed', exit_time = NOW() WHERE id = ?", [session.sessionId]);

    const res = await locate(attendant, PLATE);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('No active parking session found for this vehicle');
  });

  test('an unknown registration number gets the same answer', async () => {
    const res = await locate(attendant, 'ZZ99ZZ9999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('No active parking session found for this vehicle');
  });
});

describe('invalid input', () => {
  test.each([undefined, '', '   '])('IT-07_04: an empty search (%p) shows a validation message', async (value) => {
    const res = await locate(attendant, value);
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ registrationNumber: 'Enter a registration number' });
  });

  test.each(['KA01<script>', 'KA01_AB', 'A'.repeat(21)])('an invalid search (%p) shows a validation message', async (value) => {
    const res = await locate(attendant, value);
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ registrationNumber: 'Enter a valid registration number' });
  });

  test('a repeated parameter is refused with 400', async () => {
    const res = await attendant.get('/api/parking/locate?registrationNumber=A1&registrationNumber=B2');
    expect(res.status).toBe(400);
  });
});

describe('access (NFR-11)', () => {
  test('IT-07_05: a driver trying to locate a vehicle is denied', async () => {
    await addSlot('P-1');
    await park();
    const res = await locate(driver, PLATE);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('You do not have permission to do this');
    expect(res.body.slot).toBeUndefined();
  });

  test('without a session the search is refused with 401', async () => {
    const res = await request(app).get('/api/parking/locate').query({ registrationNumber: PLATE });
    expect(res.status).toBe(401);
  });
});

describe('latest slot after reassignment', () => {
  test('ST-07_06: the result shows the new slot after the session is moved', async () => {
    const first = await addSlot('P-1');
    const second = await addSlot('P-2');
    const session = await park();
    expect((await locate(attendant, PLATE)).body.slot.code).toBe(first.code);

    // Slot reassignment is not built yet, so move the active session directly.
    await db.query('UPDATE parking_sessions SET slot_id = ? WHERE id = ?', [second.id, session.sessionId]);

    const res = await locate(attendant, PLATE);
    expect(res.status).toBe(200);
    expect(res.body.slot).toMatchObject({ id: second.id, code: 'P-2', status: 'occupied' });
  });
});