// Story #29 (FR-12, UC-12): administrators add and disable parking slots.
const request = require('supertest');
const app = require('../../server/src/app');
const slotsService = require('../../server/src/modules/slots/slots.service');
const { ROLES } = require('../../server/src/modules/users/roles');
const { db, clearTables } = require('../helpers/db');
const { createUser, loginAs } = require('../helpers/users');

let admin;

beforeEach(async () => {
  await clearTables();
  admin = await loginAs(await createUser(ROLES.ADMIN));
});

afterAll(() => db.end());

async function addSlot(code, type = 'four_wheeler') {
  const res = await admin.post('/api/slots').send({ code, type });
  expect(res.status).toBe(201);
  return res.body.slot;
}

describe('adding a slot', () => {
  test('a new slot is Available and appears in the list', async () => {
    const res = await admin.post('/api/slots').send({ code: 'p-30', type: 'four_wheeler' });

    expect(res.status).toBe(201);
    expect(res.body.slot).toMatchObject({ code: 'P-30', type: 'four_wheeler', status: 'available' });
    expect(res.body.message).toBe('Slot P-30 added.');

    const list = await admin.get('/api/slots');
    expect(list.body.slots.map((s) => s.code)).toEqual(['P-30']);
  });

  test('the list is in natural code order', async () => {
    for (const code of ['P-10', 'P-2', 'P-1']) await addSlot(code);
    const res = await admin.get('/api/slots');
    expect(res.body.slots.map((s) => s.code)).toEqual(['P-1', 'P-2', 'P-10']);
  });

  test('a code already in use is refused with 409', async () => {
    await addSlot('P-30');
    const res = await admin.post('/api/slots').send({ code: ' p-30', type: 'two_wheeler' });

    expect(res.status).toBe(409);
    expect(res.body.fields).toEqual({ code: 'This slot code is already in use' });
  });

  test('invalid details are refused with 400 and nothing is saved', async () => {
    const res = await admin.post('/api/slots').send({ code: 'P 30', type: 'truck' });

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(['code', 'type']);
    expect((await admin.get('/api/slots')).body.slots).toEqual([]);
  });
});

describe('disabling a slot', () => {
  test('IT-12_05: a disabled slot shows Unavailable and is not assignable', async () => {
    const slot = await addSlot('P-30');
    const other = await addSlot('P-31');

    const res = await admin.patch(`/api/slots/${slot.id}`).send({ disabled: true });

    expect(res.status).toBe(200);
    expect(res.body.slot.status).toBe('unavailable');
    expect(res.body.message).toBe('Slot P-30 is now unavailable.');

    const list = await admin.get('/api/slots');
    expect(list.body.slots.find((s) => s.id === slot.id).status).toBe('unavailable');

    const assignable = await slotsService.listAssignable('four_wheeler');
    expect(assignable.map((s) => s.id)).toEqual([other.id]);
  });

  test('a disabled slot can be enabled again', async () => {
    const slot = await addSlot('P-30');
    await admin.patch(`/api/slots/${slot.id}`).send({ disabled: true });

    const res = await admin.patch(`/api/slots/${slot.id}`).send({ disabled: false });

    expect(res.body.slot.status).toBe('available');
    expect((await slotsService.listAssignable('four_wheeler')).map((s) => s.id)).toEqual([slot.id]);
  });

  test('only slots of the requested type are assignable (DR-07)', async () => {
    const car = await addSlot('P-1', 'four_wheeler');
    const bike = await addSlot('P-2', 'two_wheeler');

    expect((await slotsService.listAssignable('two_wheeler')).map((s) => s.id)).toEqual([bike.id]);
    expect((await slotsService.listAssignable('four_wheeler')).map((s) => s.id)).toEqual([car.id]);
  });

  test('disabled must be true or false', async () => {
    const slot = await addSlot('P-30');
    const res = await admin.patch(`/api/slots/${slot.id}`).send({ disabled: 'yes' });

    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ disabled: 'Must be true or false' });
  });

  test.each(['999', '1abc'])('slot id %p is not found', async (id) => {
    await addSlot('P-1');
    const res = await admin.patch(`/api/slots/${id}`).send({ disabled: true });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Slot not found');
  });
});

describe('only administrators manage slots (NFR-11)', () => {
  // Viewing the list is open to every logged-in role (FR-03, see slot-availability.test.js).
  const routes = [
    ['get', '/api/slots'],
    ['post', '/api/slots'],
    ['patch', '/api/slots/1'],
  ];
  const adminOnlyRoutes = routes.filter(([method]) => method !== 'get');

  test.each(routes)('%s %s without a session gives 401', async (method, path) => {
    const res = await request(app)[method](path).send({ code: 'P-1', type: 'four_wheeler', disabled: true });
    expect(res.status).toBe(401);
  });

  test.each([ROLES.DRIVER, ROLES.ATTENDANT])('a %s is refused with 403 and nothing changes', async (role) => {
    const slot = await addSlot('P-1');
    const agent = await loginAs(await createUser(role, { email: `${role}-slots@example.com` }));

    for (const [method, path] of adminOnlyRoutes) {
      const res = await agent[method](path.replace('/1', `/${slot.id}`)).send({ code: 'P-2', type: 'four_wheeler', disabled: true });
      expect(res.status).toBe(403);
    }

    const list = await admin.get('/api/slots');
    expect(list.body.slots).toEqual([expect.objectContaining({ code: 'P-1', status: 'available' })]);
  });

  test.each([ROLES.DRIVER, ROLES.ATTENDANT])('a %s may view the slot list', async (role) => {
    await addSlot('P-1');
    const agent = await loginAs(await createUser(role, { email: `${role}-view@example.com` }));
    const res = await agent.get('/api/slots');
    expect(res.status).toBe(200);
    expect(res.body.slots.map((s) => s.code)).toEqual(['P-1']);
  });
});