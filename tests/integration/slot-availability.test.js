// Issue #56 (FR-03, NFR-01): everyone logged in can view live slot availability.
const request = require('supertest');
const app = require('../../server/src/app');
const vehicles = require('../../server/src/modules/users/vehicles/vehicles.repository');
const { ROLES } = require('../../server/src/modules/users/roles');
const { db, clearTables } = require('../helpers/db');
const { createUser, loginAs } = require('../helpers/users');

jest.setTimeout(20000);

let admin;
let driverUser;
let driver;
let attendant;
let plate = 0;

beforeEach(async () => {
  await clearTables();
  admin = await loginAs(await createUser(ROLES.ADMIN));
  driverUser = await createUser(ROLES.DRIVER);
  driver = await loginAs(driverUser);
  attendant = await loginAs(await createUser(ROLES.ATTENDANT));
});

afterAll(() => db.end());

async function addSlot(code, type = 'four_wheeler') {
  const res = await admin.post('/api/slots').send({ code, type });
  expect(res.status).toBe(201);
  return res.body.slot;
}

function addVehicle(type = 'four_wheeler') {
  plate += 1;
  return vehicles.create({
    userId: driverUser.id,
    registrationNumber: `KA01AB${1000 + plate}`,
    type,
    model: 'Test',
    colour: 'White',
  });
}

// An active parking session makes the slot Occupied.
async function occupy(slot) {
  const vehicle = await addVehicle(slot.type);
  const [result] = await db.query('INSERT INTO parking_sessions (vehicle_id, slot_id) VALUES (?, ?)', [vehicle.id, slot.id]);
  return result.insertId;
}

// A reservation window around "now" makes the slot Reserved. Offsets are in hours.
async function reserve(slot, { fromHours = -1, toHours = 1, status = 'reserved' } = {}) {
  const vehicle = await addVehicle(slot.type);
  await db.query(
    `INSERT INTO reservations (user_id, vehicle_id, slot_id, start_time, end_time, status)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR), DATE_ADD(NOW(), INTERVAL ? HOUR), ?)`,
    [driverUser.id, vehicle.id, slot.id, fromHours, toHours, status],
  );
}

const statusByCode = (res) => Object.fromEntries(res.body.slots.map((s) => [s.code, s.status]));
const codes = (res) => res.body.slots.map((s) => s.code);

// B-1 two-wheeler available; P-1 available; P-2 occupied; P-3 reserved; P-4 unavailable.
async function seedMixed() {
  await addSlot('P-1');
  await occupy(await addSlot('P-2'));
  await reserve(await addSlot('P-3'));
  const p4 = await addSlot('P-4');
  await admin.patch(`/api/slots/${p4.id}`).send({ disabled: true });
  await addSlot('B-1', 'two_wheeler');
}

describe('who can view availability', () => {
  test.each(['admin', 'driver', 'attendant'])('a %s can view the slot list', async (role) => {
    await addSlot('P-1');
    const agent = { admin, driver, attendant }[role];
    const res = await agent.get('/api/slots');
    expect(res.status).toBe(200);
    expect(codes(res)).toEqual(['P-1']);
  });

  test('without a session the list is refused with 401', async () => {
    expect((await request(app).get('/api/slots')).status).toBe(401);
  });

  test('the response is never cached', async () => {
    const res = await driver.get('/api/slots');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('slot statuses', () => {
  test('each slot shows Available, Occupied, Reserved or Unavailable', async () => {
    await seedMixed();
    const res = await driver.get('/api/slots');
    expect(statusByCode(res)).toEqual({
      'B-1': 'available',
      'P-1': 'available',
      'P-2': 'occupied',
      'P-3': 'reserved',
      'P-4': 'unavailable',
    });
  });

  test('counts cover every slot', async () => {
    await seedMixed();
    const res = await attendant.get('/api/slots');
    expect(res.body.counts).toEqual({ total: 5, available: 2, occupied: 1, reserved: 1, unavailable: 1 });
  });

  test('a reservation for later or earlier today does not make a slot Reserved', async () => {
    const later = await addSlot('P-1');
    const earlier = await addSlot('P-2');
    await reserve(later, { fromHours: 2, toHours: 3 });
    await reserve(earlier, { fromHours: -3, toHours: -2 });
    const res = await driver.get('/api/slots');
    expect(statusByCode(res)).toEqual({ 'P-1': 'available', 'P-2': 'available' });
  });

  test('a cancelled reservation does not make a slot Reserved', async () => {
    await reserve(await addSlot('P-1'), { status: 'cancelled' });
    expect(statusByCode(await driver.get('/api/slots'))).toEqual({ 'P-1': 'available' });
  });

  test('Occupied wins over Reserved', async () => {
    const slot = await addSlot('P-1');
    await reserve(slot);
    await occupy(slot);
    expect(statusByCode(await driver.get('/api/slots'))).toEqual({ 'P-1': 'occupied' });
  });

  test('Unavailable wins over Occupied', async () => {
    const slot = await addSlot('P-1');
    await occupy(slot);
    await admin.patch(`/api/slots/${slot.id}`).send({ disabled: true });
    expect(statusByCode(await driver.get('/api/slots'))).toEqual({ 'P-1': 'unavailable' });
  });

  test('a slot that is reserved right now can still be booked for another time', async () => {
    const slot = await addSlot('P-1');
    await reserve(slot);
    const vehicle = await addVehicle();
    const res = await driver.post('/api/reservations').send({
      vehicleId: vehicle.id,
      slotId: slot.id,
      startTime: '2030-01-10T10:00:00',
      endTime: '2030-01-10T11:00:00',
    });
    expect(res.status).toBe(201);
  });

  test('an occupied slot still cannot be reserved', async () => {
    const slot = await addSlot('P-1');
    await occupy(slot);
    const vehicle = await addVehicle();
    const res = await driver.post('/api/reservations').send({
      vehicleId: vehicle.id,
      slotId: slot.id,
      startTime: '2030-01-10T10:00:00',
      endTime: '2030-01-10T11:00:00',
    });
    expect(res.status).toBe(409);
  });
});

describe('filtering by status', () => {
  beforeEach(seedMixed);

  test.each([
    ['available', ['B-1', 'P-1']],
    ['occupied', ['P-2']],
    ['reserved', ['P-3']],
    ['unavailable', ['P-4']],
  ])('?status=%s returns only those slots', async (status, expected) => {
    const res = await driver.get('/api/slots').query({ status });
    expect(res.status).toBe(200);
    expect(codes(res)).toEqual(expected);
  });

  test('the counts stay the same while filtering', async () => {
    const res = await driver.get('/api/slots').query({ status: 'occupied' });
    expect(res.body.counts.total).toBe(5);
  });

  test('status and type can be combined', async () => {
    const res = await driver.get('/api/slots').query({ status: 'available', type: 'two_wheeler' });
    expect(codes(res)).toEqual(['B-1']);
  });

  test('an empty filter means all slots', async () => {
    const res = await driver.get('/api/slots').query({ status: '', type: '' });
    expect(codes(res)).toHaveLength(5);
  });

  test('a filter that matches nothing returns an empty list', async () => {
    await db.query("UPDATE parking_slots SET is_disabled = FALSE");
    const res = await driver.get('/api/slots').query({ status: 'unavailable' });
    expect(res.status).toBe(200);
    expect(res.body.slots).toEqual([]);
  });

  test('an unknown status or type is refused with 400', async () => {
    const res = await driver.get('/api/slots').query({ status: 'free', type: 'truck' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(['status', 'type']);
  });

  test('a repeated status parameter is refused with 400', async () => {
    const res = await driver.get('/api/slots?status=available&status=occupied');
    expect(res.status).toBe(400);
  });
});

describe('status changes show immediately', () => {
  test('a slot turns Occupied when a vehicle is assigned and Available when it is released', async () => {
    await addSlot('P-1');
    expect(statusByCode(await driver.get('/api/slots'))).toEqual({ 'P-1': 'available' });

    const vehicle = await addVehicle();
    const assign = await driver.post('/api/parking/assign').send({ vehicleId: vehicle.id });
    expect(assign.status).toBe(201);
    expect(statusByCode(await driver.get('/api/slots'))).toEqual({ 'P-1': 'occupied' });

    // Vehicle exit (#66) is not built yet, so release the slot directly.
    await db.query("UPDATE parking_sessions SET status = 'completed', exit_time = NOW() WHERE id = ?", [
      assign.body.session.sessionId,
    ]);
    expect(statusByCode(await driver.get('/api/slots'))).toEqual({ 'P-1': 'available' });
  });

  test('a slot turns Unavailable as soon as an admin disables it', async () => {
    const slot = await addSlot('P-1');
    await admin.patch(`/api/slots/${slot.id}`).send({ disabled: true });
    expect(statusByCode(await attendant.get('/api/slots'))).toEqual({ 'P-1': 'unavailable' });
  });
});

describe('NFR-01: the list loads within 2 seconds for 95% of requests', () => {
  test('300 slots with sessions and reservations load in under 2 seconds at the 95th percentile', async () => {
    const rows = Array.from({ length: 300 }, (_, i) => [`S-${i + 1}`, i % 3 === 0 ? 'two_wheeler' : 'four_wheeler']);
    await db.query('INSERT INTO parking_slots (code, slot_type) VALUES ?', [rows]);
    await occupy({ id: 1, type: 'four_wheeler' });
    await reserve({ id: 2, type: 'four_wheeler' });

    const durations = [];
    for (let i = 0; i < 20; i += 1) {
      const start = Date.now();
      const res = await driver.get('/api/slots');
      durations.push(Date.now() - start);
      expect(res.status).toBe(200);
      expect(res.body.slots).toHaveLength(300);
    }
    durations.sort((a, b) => a - b);
    expect(durations[Math.ceil(durations.length * 0.95) - 1]).toBeLessThan(2000);
  });
});