
const request = require('supertest');
const app = require('../../server/src/app');
const { ROLES } = require('../../server/src/modules/users/roles');
const { db, clearTables } = require('../helpers/db');
const { createUser, loginAs } = require('../helpers/users');

let driver;
let admin;
let attendant;
let vehicleId;

beforeEach(async () => {
  await clearTables();

  driver = await loginAs(await createUser(ROLES.DRIVER));
  admin = await loginAs(await createUser(ROLES.ADMIN));
  attendant = await loginAs(
    await createUser(ROLES.ATTENDANT, {
      email: 'attendant@example.com',
    }),
  );

  const vehicleRes = await driver.post('/api/vehicles').send({
    registrationNumber: 'KA01AB1234',
    type: 'four_wheeler',
    model: 'Test Car',
    colour: 'White',
  });

  expect(vehicleRes.status).toBe(201);
  vehicleId = vehicleRes.body.vehicle.id;
});

afterAll(() => db.end());

async function addSlot(code, type = 'four_wheeler') {
  const res = await admin.post('/api/slots').send({ code, type });
  expect(res.status).toBe(201);
  return res.body.slot;
}

async function assign(vehicle = vehicleId) {
  return driver.post('/api/parking/assign').send({ vehicleId: vehicle });
}

describe('automatic parking slot assignment (Issue #62)', () => {
  test('UT-06_01: assigns an available slot matching the vehicle type', async () => {
    await addSlot('P-10', 'four_wheeler');
    const suitableSlot = await addSlot('P-2', 'four_wheeler');
    await addSlot('B-1', 'two_wheeler');

    const res = await assign();

    expect(res.status).toBe(201);
    expect(res.body.session).toMatchObject({
      vehicleId,
      slotId: suitableSlot.id,
      slotCode: 'P-2',
      slotType: 'four_wheeler',
      status: 'active',
    });

    const again = await admin.get('/api/slots');
    expect(
      again.body.slots.find((s) => s.id === suitableSlot.id).status,
    ).toBe('occupied');
  });

  test('returns 409 when no suitable slot is available', async () => {
    await addSlot('B-1', 'two_wheeler');

    const res = await assign();

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/No suitable parking slot/i);
  });

  test('IT-06_04: does not assign a disabled slot', async () => {
    const slot = await addSlot('P-1');
    await admin.patch(`/api/slots/${slot.id}`).send({ disabled: true });

    const res = await assign();

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/No suitable parking slot/i);
  });

  test('IT-06_03: does not assign a slot with an active parking session', async () => {
    const occupiedSlot = await addSlot('P-1');
    const spareSlot = await addSlot('P-2');

    const first = await assign();
    expect(first.status).toBe(201);
    expect(first.body.session.slotId).toBe(occupiedSlot.id);

    // A second vehicle must be created for the second assignment.
    const secondVehicleRes = await driver.post('/api/vehicles').send({
      registrationNumber: 'KA02CD5678',
      type: 'four_wheeler',
      model: 'Second Car',
      colour: 'Black',
    });
    expect(secondVehicleRes.status).toBe(201);

    const second = await driver
      .post('/api/parking/assign')
      .send({ vehicleId: secondVehicleRes.body.vehicle.id });

    expect(second.status).toBe(201);
    expect(second.body.session.slotId).toBe(spareSlot.id);
  });

  test('does not allow the same vehicle to have two active sessions', async () => {
    await addSlot('P-1');
    await addSlot('P-2');

    const first = await assign();
    expect(first.status).toBe(201);

    const second = await assign();

    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/active parking session/i);
  });

  test('returns 404 for a vehicle that does not belong to the driver', async () => {
    await addSlot('P-1');

    const anotherDriver = await loginAs(
      await createUser(ROLES.DRIVER, {
        email: 'another-driver@example.com',
      }),
    );

    const otherVehicleRes = await anotherDriver.post('/api/vehicles').send({
      registrationNumber: 'KA03EF9012',
      type: 'four_wheeler',
      model: 'Other Car',
      colour: 'Red',
    });
    expect(otherVehicleRes.status).toBe(201);

    const res = await assign(otherVehicleRes.body.vehicle.id);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Vehicle not found');
  });

  test('requires authentication', async () => {
    const res = await request(app)
      .post('/api/parking/assign')
      .send({ vehicleId });

    expect(res.status).toBe(401);
  });

  test('rejects an invalid vehicle ID', async () => {
    const res = await driver
      .post('/api/parking/assign')
      .send({ vehicleId: -1 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/vehicleId/i);
  });
});

describe('record vehicle entry (Issue #60)', () => {

  test('allows an attendant to record entry for another driver vehicle', async () => {
    const anotherDriver = await loginAs(
      await createUser(ROLES.DRIVER, {
        email: 'second-driver@example.com',
      }),
    );

    const vehicleRes = await anotherDriver.post('/api/vehicles').send({
      registrationNumber: 'KA04GH3456',
      type: 'four_wheeler',
      model: 'Another Car',
      colour: 'Blue',
    });

    expect(vehicleRes.status).toBe(201);

    await addSlot('ENT-OTHER');

    const res = await attendant
      .post('/api/parking/assign')
      .send({ vehicleId: vehicleRes.body.vehicle.id });

    expect(res.status).toBe(201);
    expect(res.body.session).toMatchObject({
      vehicleId: vehicleRes.body.vehicle.id,
      slotCode: 'ENT-OTHER',
      status: 'active',
    });
  });

  test('allows an attendant to record entry for a registered vehicle', async () => {
    await addSlot('ENTRY-1');

    const res = await attendant
      .post('/api/parking/assign')
      .send({ vehicleId });

    expect(res.status).toBe(201);
    expect(res.body.session).toMatchObject({
      vehicleId,
      slotCode: 'ENTRY-1',
      status: 'active',
    });
  });

  test('records an entry timestamp for the parking session', async () => {
    await addSlot('ENTRY-2');

    const res = await assign();

    expect(res.status).toBe(201);

    const [rows] = await db.query(
      `SELECT entry_time, status
       FROM parking_sessions
       WHERE id = ?`,
      [res.body.session.sessionId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].entry_time).toBeTruthy();
    expect(new Date(rows[0].entry_time).getTime()).not.toBeNaN();
    expect(rows[0].status).toBe('active');
  });

  test('rejects an unregistered vehicle', async () => {
    await addSlot('ENTRY-3');

    const res = await driver
      .post('/api/parking/assign')
      .send({ vehicleId: 999999 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Vehicle not found');
  });

  test('records vehicle entry within three seconds', async () => {
    await addSlot('ENTRY-4');

    const start = Date.now();
    const res = await assign();
    const duration = Date.now() - start;

    expect(res.status).toBe(201);
    expect(duration).toBeLessThan(3000);
  });
});
