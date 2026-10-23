// Story #30 (FR-12, UC-12): administrators configure parking rates, and fees use them (FR-09).
const request = require('supertest');
const app = require('../../server/src/app');
const ratesService = require('../../server/src/modules/rates/rates.service');
const { ROLES } = require('../../server/src/modules/users/roles');
const { db, clearTables } = require('../helpers/db');
const { createUser, loginAs } = require('../helpers/users');

const HOUR = 3600;
let adminUser;
let admin;

beforeAll(async () => {
  await clearTables();
  adminUser = await createUser(ROLES.ADMIN);
  admin = await loginAs(adminUser);
});

beforeEach(async () => {
  await db.query('TRUNCATE TABLE parking_rates');
  await db.query(
    `INSERT INTO parking_rates (slot_type, hourly_rate, minimum_fee, billing_step_minutes) VALUES
       ('four_wheeler', 20, 10, 15), ('two_wheeler', 10, 5, 15)`,
  );
});

afterAll(() => db.end());

describe('viewing rates', () => {
  test('the admin sees the rate for each vehicle type', async () => {
    const res = await admin.get('/api/rates');

    expect(res.status).toBe(200);
    expect(res.body.rates).toEqual([
      expect.objectContaining({ type: 'four_wheeler', hourlyRate: 20, minimumFee: 10, billingStepMinutes: 15 }),
      expect.objectContaining({ type: 'two_wheeler', hourlyRate: 10, minimumFee: 5, billingStepMinutes: 15 }),
    ]);
  });
});

describe('changing a rate', () => {
  test('the new rate is saved and returned', async () => {
    const res = await admin.put('/api/rates/four_wheeler').send({ hourlyRate: 25, minimumFee: 15, billingStepMinutes: 30 });

    expect(res.status).toBe(200);
    expect(res.body.rate).toMatchObject({ type: 'four_wheeler', hourlyRate: 25, minimumFee: 15, billingStepMinutes: 30 });
    expect(res.body.message).toBe('Rate saved. New fees will use it.');

    const [rows] = await db.query("SELECT updated_by AS updatedBy FROM parking_rates WHERE slot_type = 'four_wheeler'");
    expect(rows[0].updatedBy).toBe(adminUser.id);
  });

  test('changing one vehicle type leaves the other alone', async () => {
    await admin.put('/api/rates/four_wheeler').send({ hourlyRate: 25, minimumFee: 15, billingStepMinutes: 30 });

    const twoWheeler = (await admin.get('/api/rates')).body.rates.find((r) => r.type === 'two_wheeler');
    expect(twoWheeler).toMatchObject({ hourlyRate: 10, minimumFee: 5, billingStepMinutes: 15 });
  });

  test('a rate that is missing is created', async () => {
    await db.query("DELETE FROM parking_rates WHERE slot_type = 'two_wheeler'");
    const res = await admin.put('/api/rates/two_wheeler').send({ hourlyRate: 12, minimumFee: 0, billingStepMinutes: 60 });

    expect(res.status).toBe(200);
    expect(res.body.rate).toMatchObject({ type: 'two_wheeler', hourlyRate: 12 });
  });

  test('invalid values are refused with 400 and the rate is unchanged', async () => {
    const res = await admin.put('/api/rates/four_wheeler').send({ hourlyRate: 0, minimumFee: 'ten', billingStepMinutes: 45 });

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(['billingStepMinutes', 'hourlyRate', 'minimumFee']);
    expect((await ratesService.getRate('four_wheeler')).hourlyRate).toBe(20);
  });

  test('an unknown vehicle type is not found', async () => {
    const res = await admin.put('/api/rates/truck').send({ hourlyRate: 25, minimumFee: 10, billingStepMinutes: 15 });
    expect(res.status).toBe(404);
  });
});

describe('fees use the configured rate (FR-09)', () => {
  test('IT_34: after a rate change, the next fee uses the new rate', async () => {
    expect((await ratesService.feeFor('four_wheeler', 2 * HOUR)).amount).toBe(40);

    await admin.put('/api/rates/four_wheeler').send({ hourlyRate: 25, minimumFee: 10, billingStepMinutes: 15 });

    expect((await ratesService.feeFor('four_wheeler', 2 * HOUR)).amount).toBe(50);
  });

  test('IT_24 data: a 1.5-hour stay at ₹30/hr costs ₹45', async () => {
    await admin.put('/api/rates/four_wheeler').send({ hourlyRate: 30, minimumFee: 10, billingStepMinutes: 15 });
    expect(await ratesService.feeFor('four_wheeler', 1.5 * HOUR)).toMatchObject({ billedMinutes: 90, amount: 45 });
  });

  test('IT_25 data: a zero-length stay is charged the minimum fee', async () => {
    expect((await ratesService.feeFor('four_wheeler', 0)).amount).toBe(10);
  });

  test('each vehicle type is charged its own rate', async () => {
    expect((await ratesService.feeFor('two_wheeler', 2 * HOUR)).amount).toBe(20);
    expect((await ratesService.feeFor('four_wheeler', 2 * HOUR)).amount).toBe(40);
  });

  test('a fee cannot be worked out when no rate is set', async () => {
    await db.query('TRUNCATE TABLE parking_rates');
    await expect(ratesService.feeFor('four_wheeler', HOUR)).rejects.toMatchObject({ status: 503 });
  });
});

describe('only administrators set rates (NFR-11)', () => {
  const body = { hourlyRate: 99, minimumFee: 1, billingStepMinutes: 60 };

  test.each([
    ['get', '/api/rates'],
    ['put', '/api/rates/four_wheeler'],
  ])('%s %s without a session gives 401', async (method, path) => {
    const res = await request(app)[method](path).send(body);
    expect(res.status).toBe(401);
  });

  test.each([ROLES.DRIVER, ROLES.ATTENDANT])('a %s is refused with 403 and the rate is unchanged', async (role) => {
    const agent = await loginAs(await createUser(role, { email: `${role}-rates@example.com` }));

    expect((await agent.get('/api/rates')).status).toBe(403);
    expect((await agent.put('/api/rates/four_wheeler').send(body)).status).toBe(403);
    expect((await ratesService.getRate('four_wheeler')).hourlyRate).toBe(20);
  });
});
