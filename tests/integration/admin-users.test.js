// Story #28 (FR-12, UC-12): administrators manage users and vehicles.
const request = require('supertest');
const app = require('../../server/src/app');
const { ROLES } = require('../../server/src/modules/users/roles');
const { db, clearTables } = require('../helpers/db');
const { createUser, loginAs, TEST_PASSWORD } = require('../helpers/users');

const car = { registrationNumber: 'KA01AB1234', type: 'four_wheeler', model: 'Swift', colour: 'Red' };
let adminUser;
let admin;

beforeEach(async () => {
  await clearTables();
  adminUser = await createUser(ROLES.ADMIN);
  admin = await loginAs(adminUser);
});

afterAll(() => db.end());

async function driverWithCar(email = 'ravi@example.com', details = car) {
  const user = await createUser(ROLES.DRIVER, { name: 'Ravi Kumar', email });
  const res = await (await loginAs(user)).post('/api/vehicles').send(details);
  expect(res.status).toBe(201);
  return { user, vehicle: res.body.vehicle };
}

// A past parking session for the vehicle, as entry and exit would leave it.
async function giveHistory(vehicleId) {
  const [slot] = await db.query("INSERT INTO parking_slots (code, slot_type) VALUES ('P-01', 'four_wheeler')");
  await db.query(
    "INSERT INTO parking_sessions (vehicle_id, slot_id, entry_time, exit_time, status) VALUES (?, ?, NOW() - INTERVAL 2 HOUR, NOW(), 'completed')",
    [vehicleId, slot.insertId],
  );
}

describe('listing users', () => {
  test('the admin sees every user with a vehicle count and no password hash', async () => {
    await driverWithCar();

    const res = await admin.get('/api/admin/users');

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(2);
    expect(res.body.users.find((u) => u.email === 'ravi@example.com')).toMatchObject({
      name: 'Ravi Kumar',
      role: 'driver',
      vehicleCount: 1,
    });
    for (const user of res.body.users) {
      expect(Object.keys(user).sort()).toEqual(['createdAt', 'email', 'id', 'name', 'role', 'vehicleCount']);
    }
  });

  test('users can be filtered by role (Bindu\'s history picker uses role=driver)', async () => {
    await driverWithCar();
    await createUser(ROLES.ATTENDANT);

    const res = await admin.get('/api/admin/users?role=driver');

    expect(res.body.users.map((u) => u.email)).toEqual(['ravi@example.com']);
  });

  test('search matches name or email, and % is matched literally', async () => {
    await driverWithCar();
    await createUser(ROLES.DRIVER, { name: 'Asha', email: 'asha@example.com' });

    expect((await admin.get('/api/admin/users?search=ravi')).body.users.map((u) => u.name)).toEqual(['Ravi Kumar']);
    expect((await admin.get('/api/admin/users?search=asha@')).body.users.map((u) => u.name)).toEqual(['Asha']);
    expect((await admin.get('/api/admin/users?search=%25')).body.users).toEqual([]);
  });

  test('an unknown role filter is refused with 400', async () => {
    const res = await admin.get('/api/admin/users?role=manager');

    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ role: 'Choose driver, attendant or admin' });
  });
});

describe('adding and removing users', () => {
  test('UT-12_02: the admin adds an attendant, who can log in, and the list updates', async () => {
    const res = await admin.post('/api/admin/users').send({
      name: 'New Attendant',
      email: 'New.Attendant@Example.com',
      password: TEST_PASSWORD,
      role: 'attendant',
    });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'new.attendant@example.com', role: 'attendant' });
    expect(res.body.user.passwordHash).toBeUndefined();

    const login = await request(app).post('/api/auth/login').send({ email: 'new.attendant@example.com', password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('attendant');

    const list = await admin.get('/api/admin/users?role=attendant');
    expect(list.body.users.map((u) => u.email)).toEqual(['new.attendant@example.com']);
  });

  test('UT-12_02: the admin removes a user, with their vehicles and logins', async () => {
    const { user } = await driverWithCar();

    const res = await admin.delete(`/api/admin/users/${user.id}`);

    expect(res.status).toBe(204);
    expect((await admin.get('/api/admin/users?role=driver')).body.users).toEqual([]);
    const [vehicles] = await db.query('SELECT COUNT(*) AS n FROM vehicles');
    const [logins] = await db.query('SELECT COUNT(*) AS n FROM auth_sessions WHERE user_id = ?', [user.id]);
    expect(vehicles[0].n).toBe(0);
    expect(logins[0].n).toBe(0);
  });

  test('an email already in use is refused with 409', async () => {
    await driverWithCar();
    const res = await admin.post('/api/admin/users').send({ name: 'Copy', email: 'ravi@example.com', password: TEST_PASSWORD, role: 'driver' });

    expect(res.status).toBe(409);
    expect(res.body.fields).toEqual({ email: 'Email is already in use' });
  });

  test('every invalid field is reported at once, including the role', async () => {
    const res = await admin.post('/api/admin/users').send({ name: 'A', email: 'abc@com', password: '123', role: 'manager' });

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(['email', 'name', 'password', 'role']);
  });

  test('an admin cannot remove their own account', async () => {
    const res = await admin.delete(`/api/admin/users/${adminUser.id}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('You cannot remove your own account');
  });

  test('a user with parking history is kept, so the history is not lost', async () => {
    const { user, vehicle } = await driverWithCar();
    await giveHistory(vehicle.id);

    const res = await admin.delete(`/api/admin/users/${user.id}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('This user has parking history and cannot be removed');
    expect((await admin.get('/api/admin/users?role=driver')).body.users).toHaveLength(1);
  });

  test.each(['999999', '1abc'])('user id %p is not found', async (id) => {
    expect((await admin.delete(`/api/admin/users/${id}`)).status).toBe(404);
    expect((await admin.get(`/api/admin/users/${id}/vehicles`)).status).toBe(404);
  });
});

describe('managing vehicles', () => {
  test("the admin views a user's vehicles", async () => {
    const { user } = await driverWithCar();

    const res = await admin.get(`/api/admin/users/${user.id}/vehicles`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: user.id, email: 'ravi@example.com' });
    expect(res.body.vehicles).toEqual([expect.objectContaining({ registrationNumber: 'KA01AB1234', colour: 'Red' })]);
  });

  test("the admin updates any user's vehicle, with the same rules as the driver", async () => {
    const { vehicle } = await driverWithCar();

    const res = await admin.put(`/api/admin/vehicles/${vehicle.id}`).send({ ...car, registrationNumber: 'ka 01 ab-1234', colour: 'Blue' });

    expect(res.status).toBe(200);
    expect(res.body.vehicle).toMatchObject({ registrationNumber: 'KA01AB1234', colour: 'Blue' });

    const bad = await admin.put(`/api/admin/vehicles/${vehicle.id}`).send({ ...car, type: 'Car' });
    expect(bad.status).toBe(400);
  });

  test("changing a vehicle to another vehicle's number is refused with 409", async () => {
    await driverWithCar();
    const { vehicle } = await driverWithCar('asha@example.com', { ...car, registrationNumber: 'KA02CD5678' });

    const res = await admin.put(`/api/admin/vehicles/${vehicle.id}`).send(car);

    expect(res.status).toBe(409);
  });

  test('the admin removes a vehicle without history', async () => {
    const { user, vehicle } = await driverWithCar();

    expect((await admin.delete(`/api/admin/vehicles/${vehicle.id}`)).status).toBe(204);
    expect((await admin.get(`/api/admin/users/${user.id}/vehicles`)).body.vehicles).toEqual([]);
  });

  test('a vehicle with parking history is kept', async () => {
    const { vehicle } = await driverWithCar();
    await giveHistory(vehicle.id);

    const res = await admin.delete(`/api/admin/vehicles/${vehicle.id}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('This vehicle has parking history and cannot be removed');
  });

  test('a driver deleting their own vehicle with history gets 409, not a server error', async () => {
    const user = await createUser(ROLES.DRIVER, { email: 'own@example.com' });
    const driver = await loginAs(user);
    const vehicle = (await driver.post('/api/vehicles').send(car)).body.vehicle;
    await giveHistory(vehicle.id);

    const res = await driver.delete(`/api/vehicles/${vehicle.id}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('This vehicle has parking history and cannot be removed');
  });

  test.each(['999999', '1abc'])('vehicle id %p is not found', async (id) => {
    expect((await admin.put(`/api/admin/vehicles/${id}`).send(car)).status).toBe(404);
    expect((await admin.delete(`/api/admin/vehicles/${id}`)).status).toBe(404);
  });
});

describe('only administrators manage users (NFR-11)', () => {
  const calls = [
    ['get', '/api/admin/users'],
    ['post', '/api/admin/users'],
    ['delete', '/api/admin/users/1'],
    ['get', '/api/admin/users/1/vehicles'],
    ['put', '/api/admin/vehicles/1'],
    ['delete', '/api/admin/vehicles/1'],
  ];

  test.each(calls)('%s %s without a session gives 401', async (method, path) => {
    expect((await request(app)[method](path).send({})).status).toBe(401);
  });

  test.each([ROLES.DRIVER, ROLES.ATTENDANT])('a %s is refused with 403 on every route', async (role) => {
    const agent = await loginAs(await createUser(role, { email: `${role}-admin@example.com` }));

    for (const [method, path] of calls) {
      expect((await agent[method](path).send({})).status).toBe(403);
    }
  });
});
