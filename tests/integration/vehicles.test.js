// Story #54 (FR-02): drivers register and manage their own vehicles.
// Review follow-ups from PR #74: normalised registration numbers, fixed vehicle types,
// checked ids and driver-only access.
const request = require('supertest');
const app = require('../../server/src/app');
const { ROLES } = require('../../server/src/modules/users/roles');
const { db, clearTables } = require('../helpers/db');
const { createUser, loginAs } = require('../helpers/users');

const car = { registrationNumber: 'KA01AB1234', type: 'four_wheeler', model: 'Swift', colour: 'Red' };
let driverUser;
let driver;
let otherDriver;

beforeAll(async () => {
  await clearTables();
  driverUser = await createUser(ROLES.DRIVER);
  driver = await loginAs(driverUser);
  otherDriver = await loginAs(await createUser(ROLES.DRIVER, { email: 'other-driver@example.com' }));
});

beforeEach(() => db.query('DELETE FROM vehicles'));

afterAll(() => db.end());

async function addCar(agent = driver, details = car) {
  const res = await agent.post('/api/vehicles').send(details);
  expect(res.status).toBe(201);
  return res.body.vehicle;
}

describe('registering vehicles', () => {
  test('UT-02_01: a new vehicle is saved and listed', async () => {
    const res = await driver.post('/api/vehicles').send(car);

    expect(res.status).toBe(201);
    expect(res.body.vehicle).toMatchObject({ ...car, userId: driverUser.id });
    expect((await driver.get('/api/vehicles')).body.vehicles).toHaveLength(1);
  });

  test('UT-02_02: the driver sees only their own vehicles', async () => {
    await addCar();
    await addCar(otherDriver, { ...car, registrationNumber: 'KA02CD5678' });

    const res = await driver.get('/api/vehicles');
    expect(res.body.vehicles.map((v) => v.registrationNumber)).toEqual(['KA01AB1234']);
  });

  test('IT-02_03: the same number is refused, even written with spaces and hyphens', async () => {
    await addCar();
    const res = await otherDriver.post('/api/vehicles').send({ ...car, registrationNumber: 'ka 01 ab-1234' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('This vehicle already exists');
    expect(res.body.fields).toEqual({ registrationNumber: 'Registration number is already in use' });
  });

  test('IT-02_04: an invalid registration number is refused', async () => {
    const res = await driver.post('/api/vehicles').send({ ...car, registrationNumber: '1234' });

    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ registrationNumber: 'Enter a valid registration number' });
  });

  test('the number is stored normalised, so entry and locate can find it', async () => {
    const vehicle = await addCar(driver, { ...car, registrationNumber: 'ka 01 ab-1234' });
    expect(vehicle.registrationNumber).toBe('KA01AB1234');
  });

  test('a type that no slot has, such as "Car", is refused', async () => {
    const res = await driver.post('/api/vehicles').send({ ...car, type: 'Car' });

    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ type: 'Choose two-wheeler or four-wheeler' });
  });
});

describe('changing vehicles', () => {
  test('IT-02_05: changing the colour from Red to Blue is saved', async () => {
    const vehicle = await addCar();
    const res = await driver.put(`/api/vehicles/${vehicle.id}`).send({ ...car, colour: 'Blue' });

    expect(res.status).toBe(200);
    expect(res.body.vehicle.colour).toBe('Blue');
  });

  test('ST-02_06: the change is still there after logging out and in again', async () => {
    const vehicle = await addCar();
    await driver.put(`/api/vehicles/${vehicle.id}`).send({ ...car, colour: 'Blue' });

    const again = await loginAs(driverUser);
    const res = await again.get(`/api/vehicles/${vehicle.id}`);
    expect(res.body.vehicle.colour).toBe('Blue');
  });

  test('a vehicle can be deleted', async () => {
    const vehicle = await addCar();

    expect((await driver.delete(`/api/vehicles/${vehicle.id}`)).status).toBe(204);
    expect((await driver.get('/api/vehicles')).body.vehicles).toEqual([]);
  });

  test("another driver cannot read, change or delete someone else's vehicle", async () => {
    const vehicle = await addCar();

    expect((await otherDriver.get(`/api/vehicles/${vehicle.id}`)).status).toBe(404);
    expect((await otherDriver.put(`/api/vehicles/${vehicle.id}`).send({ ...car, colour: 'Blue' })).status).toBe(404);
    expect((await otherDriver.delete(`/api/vehicles/${vehicle.id}`)).status).toBe(404);
    expect((await driver.get(`/api/vehicles/${vehicle.id}`)).body.vehicle.colour).toBe('Red');
  });

  test.each(['1abc', '0', '999999'])('vehicle id %p is not found', async (id) => {
    await addCar();
    const res = await driver.get(`/api/vehicles/${id}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Vehicle not found');
  });
});

describe('only drivers use My vehicles (NFR-11)', () => {
  test('without a session the request is refused with 401', async () => {
    expect((await request(app).get('/api/vehicles')).status).toBe(401);
  });

  test.each([ROLES.ATTENDANT, ROLES.ADMIN])('a %s is refused with 403', async (role) => {
    const staff = await loginAs(await createUser(role, { email: `${role}-vehicles@example.com` }));

    expect((await staff.get('/api/vehicles')).status).toBe(403);
    expect((await staff.post('/api/vehicles').send(car)).status).toBe(403);
  });
});
