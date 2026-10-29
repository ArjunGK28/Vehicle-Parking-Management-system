// Story #32 (NFR-16, NFR-17): key administrator actions are logged, and only admins can read the log.
const request = require('supertest');
const app = require('../../server/src/app');
const { ROLES } = require('../../server/src/modules/users/roles');
const { db, clearTables } = require('../helpers/db');
const { createUser, loginAs, TEST_PASSWORD } = require('../helpers/users');

let adminUser;
let admin;

beforeEach(async () => {
  await clearTables();
  adminUser = await createUser(ROLES.ADMIN, { name: 'Asha Admin' });
  admin = await loginAs(adminUser);
});

afterAll(() => db.end());

const latest = async (query = '') => (await admin.get(`/api/audit${query}`)).body;

describe('admin actions are logged (NFR-16)', () => {
  test('ST-12_06: a rate update shows the action, the administrator and the time', async () => {
    const res = await admin.put('/api/rates/four_wheeler').send({ hourlyRate: 25, minimumFee: 10, billingStepMinutes: 15 });
    expect(res.status).toBe(200);

    const { entries, total } = await latest();
    expect(total).toBe(1);
    expect(entries[0]).toMatchObject({
      action: 'rate_changed',
      summary: 'Set the four-wheeler rate to ₹25/hr, minimum ₹10, billed in 15-minute steps',
      adminId: adminUser.id,
      adminName: 'Asha Admin',
      adminEmail: adminUser.email,
    });
    const [now] = await db.query('SELECT ABS(TIMESTAMPDIFF(SECOND, ?, NOW())) AS drift', [entries[0].createdAt]);
    expect(now[0].drift).toBeLessThanOrEqual(5);
  });

  test('adding, disabling and enabling a slot are each logged', async () => {
    const slot = (await admin.post('/api/slots').send({ code: 'P-30', type: 'four_wheeler' })).body.slot;
    await admin.patch(`/api/slots/${slot.id}`).send({ disabled: true });
    await admin.patch(`/api/slots/${slot.id}`).send({ disabled: false });

    const { entries } = await latest();
    expect(entries.map((e) => [e.action, e.summary])).toEqual([
      ['slot_enabled', 'Enabled slot P-30'],
      ['slot_disabled', 'Disabled slot P-30'],
      ['slot_added', 'Added slot P-30 (four-wheeler)'],
    ]);
  });

  test('adding and removing a user, and changing and removing a vehicle, are logged', async () => {
    const created = (await admin.post('/api/admin/users').send({ name: 'Gate Two', email: 'gate2@example.com', password: TEST_PASSWORD, role: 'attendant' })).body.user;
    await admin.delete(`/api/admin/users/${created.id}`);

    const driver = await createUser(ROLES.DRIVER, { email: 'ravi@example.com' });
    const vehicle = (await (await loginAs(driver)).post('/api/vehicles').send({ registrationNumber: 'KA01AB1234', type: 'four_wheeler', model: 'Swift', colour: 'Red' })).body.vehicle;
    await admin.put(`/api/admin/vehicles/${vehicle.id}`).send({ registrationNumber: 'KA01AB1234', type: 'four_wheeler', model: 'Swift', colour: 'Blue' });
    await admin.delete(`/api/admin/vehicles/${vehicle.id}`);

    const { entries } = await latest();
    expect(entries.map((e) => e.summary)).toEqual([
      'Removed vehicle KA01AB1234',
      'Updated vehicle KA01AB1234 (four-wheeler, Swift, Blue)',
      'Removed attendant account gate2@example.com (Gate Two)',
      'Added attendant account gate2@example.com (Gate Two)',
    ]);
  });

  test('a refused action is not logged', async () => {
    await admin.put('/api/rates/four_wheeler').send({ hourlyRate: 0, minimumFee: 10, billingStepMinutes: 15 });
    await admin.delete(`/api/admin/users/${adminUser.id}`);

    expect((await latest()).total).toBe(0);
  });

  test('the entry keeps the admin name after that admin account is removed', async () => {
    const other = await createUser(ROLES.ADMIN, { name: 'Old Admin', email: 'old-admin@example.com' });
    await (await loginAs(other)).post('/api/slots').send({ code: 'P-1', type: 'two_wheeler' });
    await admin.delete(`/api/admin/users/${other.id}`);

    const entry = (await latest('?action=slot_added')).entries[0];
    expect(entry).toMatchObject({ adminId: null, adminName: 'Old Admin', adminEmail: 'old-admin@example.com' });
  });
});

describe('reading the log', () => {
  test('entries can be filtered by action and paged, newest first', async () => {
    for (const code of ['P-1', 'P-2', 'P-3']) await admin.post('/api/slots').send({ code, type: 'four_wheeler' });
    await admin.put('/api/rates/two_wheeler').send({ hourlyRate: 10, minimumFee: 5, billingStepMinutes: 30 });

    const filtered = await latest('?action=slot_added&pageSize=2');
    expect(filtered).toMatchObject({ page: 1, pageSize: 2, total: 3 });
    expect(filtered.entries.map((e) => e.summary)).toEqual(['Added slot P-3 (four-wheeler)', 'Added slot P-2 (four-wheeler)']);

    const second = await latest('?action=slot_added&pageSize=2&page=2');
    expect(second.entries.map((e) => e.summary)).toEqual(['Added slot P-1 (four-wheeler)']);
  });

  test('an unknown action or bad paging is refused with 400', async () => {
    const res = await admin.get('/api/audit?action=everything&page=0&pageSize=500');

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(['action', 'page', 'pageSize']);
  });
});

describe('only administrators read the log (NFR-17)', () => {
  test('without a session the request is refused with 401', async () => {
    expect((await request(app).get('/api/audit')).status).toBe(401);
  });

  test('IT-12_03: an attendant is denied access to the audit log', async () => {
    const attendant = await loginAs(await createUser(ROLES.ATTENDANT));

    const res = await attendant.get('/api/audit');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('You do not have permission to do this');
  });

  test('a driver is denied too', async () => {
    const driver = await loginAs(await createUser(ROLES.DRIVER));
    expect((await driver.get('/api/audit')).status).toBe(403);
  });
});
