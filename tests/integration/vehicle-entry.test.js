// Story #84 (FR-05, NFR-02): the attendant records entry by typing the registration number.
const request = require('supertest');
const app = require('../../server/src/app');
const { ROLES } = require('../../server/src/modules/users/roles');
const { db, clearTables } = require('../helpers/db');
const { createUser, loginAs } = require('../helpers/users');

let admin;
let attendant;
let driver;

beforeAll(async () => {
  await clearTables();
  admin = await loginAs(await createUser(ROLES.ADMIN));
  attendant = await loginAs(await createUser(ROLES.ATTENDANT));
  driver = await loginAs(await createUser(ROLES.DRIVER));

  for (const [registrationNumber, type] of [['KA01AB1234', 'four_wheeler'], ['KA05MN0001', 'two_wheeler']]) {
    const res = await driver.post('/api/vehicles').send({ registrationNumber, type, model: 'Test', colour: 'White' });
    expect(res.status).toBe(201);
  }
});

beforeEach(async () => {
  await db.query('DELETE FROM parking_sessions');
  await db.query('DELETE FROM parking_slots');
});

afterAll(() => db.end());

async function addSlot(code, type = 'four_wheeler') {
  const res = await admin.post('/api/slots').send({ code, type });
  expect(res.status).toBe(201);
  return res.body.slot;
}

const enter = (registrationNumber, agent = attendant) =>
  agent.post('/api/parking/entry').send({ registrationNumber });

describe('recording entry (FR-05)', () => {
  test('UT-05_01: entry creates an active session with the entry time recorded', async () => {
    const slot = await addSlot('P-08');

    const res = await enter('ka 01 ab-1234');

    expect(res.status).toBe(201);
    expect(res.body.session).toMatchObject({
      registrationNumber: 'KA01AB1234',
      slotId: slot.id,
      slotCode: 'P-08',
      status: 'active',
    });
    expect(res.body.session.entryTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(res.body.message).toBe('Vehicle KA01AB1234 entered. Go to slot P-08.');

    const [rows] = await db.query('SELECT status FROM parking_sessions WHERE id = ?', [res.body.session.sessionId]);
    expect(rows[0].status).toBe('active');
  });

  test('UT-05_02: an unregistered vehicle is refused with "Vehicle not found"', async () => {
    await addSlot('P-08');

    const res = await enter('KA99ZZ9999');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Vehicle not found');
  });

  test('IT-05_03: a vehicle with an active session cannot enter again (DR-02)', async () => {
    await addSlot('P-08');
    await addSlot('P-09');
    expect((await enter('KA01AB1234')).status).toBe(201);

    const res = await enter('KA01AB1234');

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('This vehicle already has an active parking session');
  });

  test('IT-05_04: entry is refused when no slot is free', async () => {
    await addSlot('B-1', 'two_wheeler');

    const res = await enter('KA01AB1234');

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/No suitable parking slot/);
  });

  test('IT-05_05: the entry time matches the system clock', async () => {
    await addSlot('P-08');
    const res = await enter('KA01AB1234');

    const [rows] = await db.query(
      'SELECT ABS(TIMESTAMPDIFF(SECOND, entry_time, NOW())) AS drift FROM parking_sessions WHERE id = ?',
      [res.body.session.sessionId],
    );
    expect(rows[0].drift).toBeLessThanOrEqual(5);
  });

  test('ST-05_06: entry completes within 3 seconds (NFR-02)', async () => {
    await addSlot('P-08');

    const started = Date.now();
    const res = await enter('KA01AB1234');

    expect(res.status).toBe(201);
    expect(Date.now() - started).toBeLessThan(3000);
  });

  test('UT-06_02: a two-wheeler gets a two-wheeler slot (DR-07)', async () => {
    await addSlot('P-08', 'four_wheeler');
    await addSlot('B-1', 'two_wheeler');

    const res = await enter('KA05MN0001');

    expect(res.body.session).toMatchObject({ slotCode: 'B-1', slotType: 'two_wheeler' });
  });
});

describe('the assigned slot is consistent everywhere (FR-06)', () => {
  test('ST-06_06: after entry the slot shows Occupied for every role, in tracking and in the report', async () => {
    await addSlot('P-08');

    const res = await enter('KA01AB1234');
    expect(res.status).toBe(201);

    for (const agent of [driver, attendant, admin]) {
      const list = await agent.get('/api/slots');
      expect(list.body.slots.find((s) => s.code === 'P-08').status).toBe('occupied');
    }

    const located = await attendant.get('/api/parking/locate').query({ registrationNumber: 'KA01AB1234' });
    expect(located.body.slot).toMatchObject({ code: 'P-08', status: 'occupied' });

    const [[today]] = await db.query("SELECT DATE_FORMAT(NOW(), '%Y-%m-%d') AS d");
    const report = await admin.get('/api/reports/occupancy').query({ from: today.d, to: today.d });
    expect(report.body.current.occupied).toBe(1);
  });
});

describe('checking the registration number', () => {
  test.each([
    [undefined, 'Enter a registration number'],
    ['   ', 'Enter a registration number'],
    ['1234', 'Enter a valid registration number'],
    [['KA01AB1234'], 'Enter a valid registration number'],
  ])('%p is refused with "%s"', async (registrationNumber, message) => {
    const res = await enter(registrationNumber);

    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ registrationNumber: message });
  });
});

describe('only attendants record entry (NFR-11)', () => {
  test('without a session the request is refused with 401', async () => {
    expect((await request(app).post('/api/parking/entry').send({ registrationNumber: 'KA01AB1234' })).status).toBe(401);
  });

  test.each([['driver'], ['admin']])('a %s is refused with 403 and no session starts', async (role) => {
    await addSlot('P-08');

    const res = await enter('KA01AB1234', role === 'driver' ? driver : admin);

    expect(res.status).toBe(403);
    const [rows] = await db.query('SELECT COUNT(*) AS n FROM parking_sessions');
    expect(rows[0].n).toBe(0);
  });
});
