// Story #31 (FR-12, UC-12): the administrator generates an occupancy report for a date range.
const request = require('supertest');
const app = require('../../server/src/app');
const { ROLES } = require('../../server/src/modules/users/roles');
const { db, clearTables } = require('../helpers/db');
const { createUser, loginAs } = require('../helpers/users');

let admin;
let adminId;
let vehicleIds;
let slotIds;

async function insert(sql, params) {
  const [result] = await db.query(sql, params);
  return result.insertId;
}

beforeAll(async () => {
  await clearTables();
  const adminUser = await createUser(ROLES.ADMIN);
  adminId = adminUser.id;
  admin = await loginAs(adminUser);
  const driver = await createUser(ROLES.DRIVER);

  vehicleIds = [];
  for (const reg of ['KA01AA0001', 'KA01AA0002', 'KA01AA0003', 'KA01AA0004']) {
    vehicleIds.push(await insert(
      "INSERT INTO vehicles (user_id, registration_number, type, model, colour) VALUES (?, ?, 'four_wheeler', 'Test', 'White')",
      [driver.id, reg],
    ));
  }

  slotIds = {};
  for (const [code, type, disabled] of [
    ['P-1', 'four_wheeler', false], ['P-2', 'four_wheeler', false], ['P-3', 'four_wheeler', false],
    ['P-4', 'four_wheeler', true], ['B-1', 'two_wheeler', false],
  ]) {
    slotIds[code] = await insert('INSERT INTO parking_slots (code, slot_type, is_disabled) VALUES (?, ?, ?)', [code, type, disabled]);
  }
});

beforeEach(async () => {
  await db.query('DELETE FROM payments');
  await db.query('DELETE FROM parking_sessions');
  await db.query('DELETE FROM reservations');
});

afterAll(() => db.end());

// A finished session: entered and exited at the given times, with its fee and payment state.
// The report reads exit_time and payment_status only, so the session status is left as
// 'completed' for both; it works the same with or without the awaiting_payment status.
async function pastSession(vehicle, slot, entry, exit, fee, paid) {
  const id = await insert(
    `INSERT INTO parking_sessions (vehicle_id, slot_id, entry_time, exit_time, fee_amount, billed_minutes, status, payment_status)
     VALUES (?, ?, ?, ?, ?, 60, 'completed', ?)`,
    [vehicle, slot, entry, exit, fee, paid ? 'paid' : 'unpaid'],
  );
  if (paid) {
    await insert(
      "INSERT INTO payments (session_id, amount, method, status, recorded_by, created_at) VALUES (?, ?, 'cash', 'paid', ?, ?)",
      [id, fee, adminId, exit],
    );
  }
  return id;
}

async function reserve(vehicle, slot, start, end, status = 'reserved') {
  const [[user]] = await db.query('SELECT user_id AS id FROM vehicles WHERE id = ?', [vehicle]);
  await insert(
    'INSERT INTO reservations (user_id, vehicle_id, slot_id, start_time, end_time, status) VALUES (?, ?, ?, ?, ?, ?)',
    [user.id, vehicle, slot, start, end, status],
  );
}

const report = (from, to) => admin.get(`/api/reports/occupancy?from=${from}&to=${to}`);

describe('current occupancy', () => {
  test('UT-12_01: a report for today shows the occupancy right now', async () => {
    await insert('INSERT INTO parking_sessions (vehicle_id, slot_id) VALUES (?, ?)', [vehicleIds[0], slotIds['P-1']]);
    const [[today]] = await db.query("SELECT DATE_FORMAT(NOW(), '%Y-%m-%d') AS d");

    const res = await report(today.d, today.d);

    expect(res.status).toBe(200);
    expect(res.body.current).toMatchObject({ total: 5, occupied: 1, reserved: 0, available: 3, unavailable: 1 });
    // 1 taken out of 4 usable slots (the disabled one does not count)
    expect(res.body.current.occupancyPercent).toBe(25);
    expect(res.body.current.byType.four_wheeler).toMatchObject({ total: 4, occupied: 1, occupancyPercent: 33 });
    expect(res.body.current.byType.two_wheeler).toMatchObject({ total: 1, available: 1, occupancyPercent: 0 });
    expect(res.body.period.entries).toBe(1);
  });

  test('ST-04_06: a reservation covering now counts in the occupancy', async () => {
    await reserve(vehicleIds[1], slotIds['P-2'], '2000-01-01 00:00:00', '2999-01-01 00:00:00');

    const res = await report('2026-10-01', '2026-10-01');

    expect(res.body.current).toMatchObject({ reserved: 1, occupancyPercent: 25 });
  });
});

describe('the chosen dates', () => {
  beforeEach(async () => {
    // 10 Oct: two paid stays; 11 Oct: one unpaid stay; 12 Oct: nothing; 13 Oct: outside the range
    await pastSession(vehicleIds[0], slotIds['P-1'], '2026-10-10 09:00:00', '2026-10-10 11:00:00', 40, true);
    await pastSession(vehicleIds[1], slotIds['P-2'], '2026-10-10 10:00:00', '2026-10-10 11:00:00', 20, true);
    await pastSession(vehicleIds[2], slotIds['P-3'], '2026-10-11 08:00:00', '2026-10-11 11:00:00', 60, false);
    await pastSession(vehicleIds[3], slotIds['P-1'], '2026-10-13 08:00:00', '2026-10-13 09:00:00', 20, true);
    await reserve(vehicleIds[0], slotIds['P-2'], '2026-10-11 14:00:00', '2026-10-11 16:00:00');
    await reserve(vehicleIds[1], slotIds['P-3'], '2026-10-12 23:00:00', '2026-10-13 01:00:00');
    await reserve(vehicleIds[2], slotIds['P-1'], '2026-10-11 09:00:00', '2026-10-11 10:00:00', 'cancelled');
  });

  test('totals cover the range, with the end date included in full', async () => {
    const res = await report('2026-10-10', '2026-10-12');

    expect(res.body.period).toEqual({
      entries: 3,
      exits: 3,
      averageStayMinutes: 120, // (120 + 60 + 180) / 3
      unpaidFees: 60,
      payments: 2,
      revenue: 60,
      reservations: 2, // the cancelled one is left out; the one crossing midnight on the 12th counts
    });
  });

  test('every day in the range has a row, including empty days', async () => {
    const res = await report('2026-10-10', '2026-10-12');

    expect(res.body.days).toEqual([
      { date: '2026-10-10', entries: 2, exits: 2, revenue: 60, reservations: 0 },
      { date: '2026-10-11', entries: 1, exits: 1, revenue: 0, reservations: 1 },
      { date: '2026-10-12', entries: 0, exits: 0, revenue: 0, reservations: 1 },
    ]);
  });

  test('a range with no activity reports zeros and no average stay', async () => {
    const res = await report('2025-01-01', '2025-01-02');

    expect(res.body.period).toMatchObject({ entries: 0, exits: 0, averageStayMinutes: null, revenue: 0 });
    expect(res.body.days).toHaveLength(2);
  });
});

describe('checking the dates', () => {
  test.each([
    ['', '2026-10-12', ['from']],
    ['2026-02-30', '2026-03-01', ['from']],
    ['2026-10-12', '2026-10-10', ['to']],
    ['2025-01-01', '2026-10-10', ['to']],
    ['10/10/2026', 'tomorrow', ['from', 'to']],
  ])('from=%p to=%p is refused', async (from, to, fields) => {
    const res = await report(from, to);

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(fields);
  });
});

describe('only administrators see reports (NFR-11)', () => {
  test('without a session the request is refused with 401', async () => {
    expect((await request(app).get('/api/reports/occupancy?from=2026-10-10&to=2026-10-10')).status).toBe(401);
  });

  test.each([ROLES.DRIVER, ROLES.ATTENDANT])('a %s is refused with 403', async (role) => {
    const agent = await loginAs(await createUser(role, { email: `${role}-reports@example.com` }));
    expect((await agent.get('/api/reports/occupancy?from=2026-10-10&to=2026-10-10')).status).toBe(403);
  });
});
