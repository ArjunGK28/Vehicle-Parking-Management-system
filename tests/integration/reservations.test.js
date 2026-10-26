const request = require('supertest');
const app = require('../../server/src/app');
const { ROLES } = require('../../server/src/modules/users/roles');
const vehicles = require('../../server/src/modules/vehicles/vehicles.repository');
const { db, clearTables } = require('../helpers/db');
const { createUser, loginAs } = require('../helpers/users');

let driver;
let otherDriver;
let agent;
let vehicle;
let otherVehicle;
let slotId;

beforeEach(async () => {
  await clearTables();

  driver = await createUser(ROLES.DRIVER);
  otherDriver = await createUser(ROLES.DRIVER, {
    name: 'Other Driver',
    email: 'other-driver@example.com',
  });

  agent = await loginAs(driver);

  vehicle = await vehicles.create({
    userId: driver.id,
    registrationNumber: 'KA01AB1234',
    type: 'four_wheeler',
    model: 'Test Car',
    colour: 'Blue',
  });

  otherVehicle = await vehicles.create({
    userId: otherDriver.id,
    registrationNumber: 'KA02CD5678',
    type: 'four_wheeler',
    model: 'Other Car',
    colour: 'Red',
  });

  const [result] = await db.query(
    'INSERT INTO parking_slots (code, slot_type) VALUES (?, ?)',
    ['P-100', 'four_wheeler'],
  );

  slotId = result.insertId;
});

afterAll(async () => {
  await db.end();
});

function reservationBody(overrides = {}) {
  return {
    vehicleId: vehicle.id,
    slotId,
    startTime: '2027-01-10T10:00:00',
    endTime: '2027-01-10T11:00:00',
    ...overrides,
  };
}

describe('POST /api/reservations', () => {
  test('creates a reservation for the logged-in driver', async () => {
    const res = await agent
      .post('/api/reservations')
      .send(reservationBody());

    expect(res.status).toBe(201);
    expect(res.body.reservation).toMatchObject({
      user_id: driver.id,
      vehicle_id: vehicle.id,
      slot_id: slotId,
      status: 'reserved',
    });
  });

  test('requires login', async () => {
    const res = await request(app)
      .post('/api/reservations')
      .send(reservationBody());

    expect(res.status).toBe(401);
  });

  test('rejects another driver’s vehicle', async () => {
    const res = await agent
      .post('/api/reservations')
      .send(reservationBody({ vehicleId: otherVehicle.id }));

    expect(res.status).toBe(404);
  });

  test('rejects a disabled slot', async () => {
    await db.query(
      'UPDATE parking_slots SET is_disabled = TRUE WHERE id = ?',
      [slotId],
    );

    const res = await agent
      .post('/api/reservations')
      .send(reservationBody());

    expect(res.status).toBe(409);
  });

  test('rejects a missing slot', async () => {
    const res = await agent
      .post('/api/reservations')
      .send(reservationBody({ slotId: 999999 }));

    expect(res.status).toBe(404);
  });

  test('rejects overlapping reservations for the same slot', async () => {
    const first = await agent
      .post('/api/reservations')
      .send(reservationBody());

    expect(first.status).toBe(201);

    const second = await agent
      .post('/api/reservations')
      .send(
        reservationBody({
          startTime: '2027-01-10T10:30:00',
          endTime: '2027-01-10T11:30:00',
        }),
      );

    expect(second.status).toBe(409);
  });

  test('allows non-overlapping reservations for the same slot', async () => {
    const first = await agent
      .post('/api/reservations')
      .send(reservationBody());

    expect(first.status).toBe(201);

    const second = await agent
      .post('/api/reservations')
      .send(
        reservationBody({
          startTime: '2027-01-10T11:00:00',
          endTime: '2027-01-10T12:00:00',
        }),
      );

    expect(second.status).toBe(201);
  });

  test('rejects an end time before the start time', async () => {
    const res = await agent
      .post('/api/reservations')
      .send(
        reservationBody({
          startTime: '2027-01-10T11:00:00',
          endTime: '2027-01-10T10:00:00',
        }),
      );

    expect(res.status).toBe(400);
  });

  test('rejects an end time equal to the start time', async () => {
    const res = await agent
      .post('/api/reservations')
      .send(
        reservationBody({
          startTime: '2027-01-10T10:00:00',
          endTime: '2027-01-10T10:00:00',
        }),
      );

    expect(res.status).toBe(400);
  });
});

describe('GET /api/reservations', () => {
  test('requires login', async () => {
    const res = await request(app).get('/api/reservations');

    expect(res.status).toBe(401);
  });

  test('returns only the logged-in driver’s reservations', async () => {
    await agent
      .post('/api/reservations')
      .send(reservationBody());

    const res = await agent.get('/api/reservations');

    expect(res.status).toBe(200);
    expect(res.body.reservations).toHaveLength(1);
    expect(res.body.reservations[0].user_id).toBe(driver.id);
  });
});
