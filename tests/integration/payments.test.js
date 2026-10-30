// Story #42 (FR-10, SYS-13, NFR-18): paying for a session whose exit is recorded.
// Payment completes the session and releases its slot (UC-08).
// Simulated gateway: card 4111 1111 1111 1111 is accepted and 4000 0000 0000 0002 is
// declined; any UPI ID is accepted except failure@upi.
const request = require('supertest');
const app = require('../../server/src/app');
const { ROLES } = require('../../server/src/modules/users/roles');
const { db, clearTables } = require('../helpers/db');
const { createUser, loginAs } = require('../helpers/users');

const GOOD_CARD = '4111 1111 1111 1111';
const DECLINED_CARD = '4000000000000002';
const NEXT_YEAR_EXPIRY = `12/${String((new Date().getFullYear() + 1) % 100).padStart(2, '0')}`;
const UPI_ID = 'arjun@okaxis';
const FAILING_UPI_ID = 'failure@upi';

let admin;
let attendantUser;
let attendant;
let driverUser;
let driver;
let otherDriver;
const vehicleIds = {};
let slotCount = 0;

beforeAll(async () => {
  await clearTables();
  admin = await loginAs(await createUser(ROLES.ADMIN));
  attendantUser = await createUser(ROLES.ATTENDANT);
  attendant = await loginAs(attendantUser);
  driverUser = await createUser(ROLES.DRIVER);
  driver = await loginAs(driverUser);
  otherDriver = await loginAs(await createUser(ROLES.DRIVER, { email: 'other.driver@example.com' }));

  for (const [agent, registrationNumber] of [[driver, 'KA01AB1234'], [driver, 'KA03EF9012'], [otherDriver, 'KA02CD5678']]) {
    const res = await agent.post('/api/vehicles').send({ registrationNumber, type: 'four_wheeler', model: 'Test', colour: 'White' });
    expect(res.status).toBe(201);
    vehicleIds[registrationNumber] = res.body.vehicle.id;
  }
});

beforeEach(async () => {
  await db.query('DELETE FROM payments');
  await db.query('DELETE FROM parking_sessions');
  await db.query('DELETE FROM parking_slots');
});

afterAll(() => db.end());

// A session in a new slot. By default its exit was recorded an hour after entry with the
// given fee and it is waiting for payment; exited: false leaves the vehicle parked.
async function parkedSession(registrationNumber, { fee = 40, exited = true } = {}) {
  slotCount += 1;
  const slotRes = await admin.post('/api/slots').send({ code: `P-${slotCount}`, type: 'four_wheeler' });
  expect(slotRes.status).toBe(201);

  const [result] = exited
    ? await db.query(
      `INSERT INTO parking_sessions (vehicle_id, slot_id, entry_time, exit_time, status, fee_amount, billed_minutes)
       VALUES (?, ?, NOW() - INTERVAL 2 HOUR, NOW() - INTERVAL 1 HOUR, 'awaiting_payment', ?, 60)`,
      [vehicleIds[registrationNumber], slotRes.body.slot.id, fee],
    )
    : await db.query(
      'INSERT INTO parking_sessions (vehicle_id, slot_id) VALUES (?, ?)',
      [vehicleIds[registrationNumber], slotRes.body.slot.id],
    );
  return result.insertId;
}

const pay = (agent, body) => agent.post('/api/payments').send(body);

async function paymentRows() {
  const [rows] = await db.query(
    `SELECT session_id AS sessionId, amount, method, status, card_last4 AS cardLast4, recorded_by AS recordedBy
     FROM payments ORDER BY id`,
  );
  return rows;
}

async function paymentStatusOf(sessionId) {
  const [rows] = await db.query('SELECT payment_status AS paymentStatus FROM parking_sessions WHERE id = ?', [sessionId]);
  return rows[0].paymentStatus;
}

async function sessionStatusOf(sessionId) {
  const [rows] = await db.query('SELECT status FROM parking_sessions WHERE id = ?', [sessionId]);
  return rows[0].status;
}

describe('making a payment (FR-10)', () => {
  test('UT-10_01: a successful UPI payment of ₹40 is recorded and the session is marked Paid', async () => {
    const sessionId = await parkedSession('KA01AB1234', { fee: 40 });

    const res = await pay(driver, { sessionId, method: 'upi', upiId: UPI_ID });

    expect(res.status).toBe(201);
    expect(res.body.payment).toMatchObject({ sessionId, amount: 40, method: 'upi', status: 'paid', cardLast4: null });
    expect(res.body.payment.createdAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(res.body.session).toMatchObject({ id: sessionId, registrationNumber: 'KA01AB1234', fee: 40, paymentStatus: 'paid', status: 'completed' });
    expect(res.body.session.ownerId).toBeUndefined();
    expect(res.body.message).toBe('Payment of ₹40 received for KA01AB1234.');
    expect(await paymentStatusOf(sessionId)).toBe('paid');
    expect(await sessionStatusOf(sessionId)).toBe('completed');
  });

  test('UT-10_02: the available payment methods are listed', async () => {
    const staff = await attendant.get('/api/payments/methods');
    expect(staff.status).toBe(200);
    expect(staff.body.methods).toEqual([
      { id: 'cash', label: 'Cash', staffOnly: true },
      { id: 'upi', label: 'UPI' },
      { id: 'card', label: 'Card' },
    ]);

    // Cash is handed to the attendant, so drivers are not offered it.
    const own = await driver.get('/api/payments/methods');
    expect(own.body.methods.map((m) => m.id)).toEqual(['upi', 'card']);

    expect((await request(app).get('/api/payments/methods')).status).toBe(401);
  });

  test('IT-10_03: a declined card is recorded as Failed, the user is told, and the session stays unpaid', async () => {
    const sessionId = await parkedSession('KA01AB1234');

    const res = await pay(driver, { sessionId, method: 'card', cardNumber: DECLINED_CARD, cardExpiry: NEXT_YEAR_EXPIRY });

    expect(res.status).toBe(402);
    expect(res.body.error).toBe('Payment was declined. Try another card or method.');
    expect(await paymentRows()).toEqual([
      { sessionId, amount: 40, method: 'card', status: 'failed', cardLast4: '0002', recordedBy: driverUser.id },
    ]);
    expect(await paymentStatusOf(sessionId)).toBe('unpaid');
    expect(await sessionStatusOf(sessionId)).toBe('awaiting_payment');

    // The driver can try again with another card.
    const retry = await pay(driver, { sessionId, method: 'card', cardNumber: GOOD_CARD, cardExpiry: NEXT_YEAR_EXPIRY });
    expect(retry.status).toBe(201);
    expect(retry.body.payment).toMatchObject({ status: 'paid', cardLast4: '1111' });
    expect(await paymentStatusOf(sessionId)).toBe('paid');
  });

  test('IT-10_04: an expired or invalid card is rejected and nothing is recorded', async () => {
    const sessionId = await parkedSession('KA01AB1234');

    const expired = await pay(driver, { sessionId, method: 'card', cardNumber: GOOD_CARD, cardExpiry: '01/20' });
    expect(expired.status).toBe(400);
    expect(expired.body.fields).toEqual({ cardExpiry: 'This card has expired' });

    const mistyped = await pay(driver, { sessionId, method: 'card', cardNumber: '4111111111111112', cardExpiry: NEXT_YEAR_EXPIRY });
    expect(mistyped.status).toBe(400);
    expect(mistyped.body.fields).toEqual({ cardNumber: 'Enter a valid card number' });

    const missing = await pay(driver, { sessionId, method: 'card' });
    expect(missing.body.fields).toEqual({ cardNumber: 'Enter a valid card number', cardExpiry: 'Enter the expiry date as MM/YY' });

    expect(await paymentRows()).toEqual([]);
    expect(await paymentStatusOf(sessionId)).toBe('unpaid');
  });

  test('IT-10_05: the attendant takes ₹40 in cash on the driver\'s behalf', async () => {
    const sessionId = await parkedSession('KA01AB1234', { fee: 40 });

    const res = await pay(attendant, { sessionId, method: 'cash' });

    expect(res.status).toBe(201);
    expect(res.body.payment).toMatchObject({ sessionId, amount: 40, method: 'cash', status: 'paid' });
    expect(await paymentRows()).toEqual([
      { sessionId, amount: 40, method: 'cash', status: 'paid', cardLast4: null, recordedBy: attendantUser.id },
    ]);
  });

  test('ST-10_06: the payment is linked to the correct session, for the session\'s own fee (SYS-13)', async () => {
    const first = await parkedSession('KA01AB1234', { fee: 40 });
    const second = await parkedSession('KA03EF9012', { fee: 65 });

    // An amount in the request is ignored: the fee always comes from the session.
    const res = await pay(driver, { sessionId: second, method: 'upi', upiId: UPI_ID, amount: 1 });

    expect(res.status).toBe(201);
    expect(await paymentRows()).toEqual([
      expect.objectContaining({ sessionId: second, amount: 65, status: 'paid' }),
    ]);
    expect(await paymentStatusOf(second)).toBe('paid');
    expect(await paymentStatusOf(first)).toBe('unpaid');
  });
});

describe('payment rules', () => {
  test('a driver cannot pay for another driver\'s session', async () => {
    const sessionId = await parkedSession('KA02CD5678');

    const res = await pay(driver, { sessionId, method: 'upi', upiId: UPI_ID });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Parking session not found');
    expect(await paymentRows()).toEqual([]);
  });

  test('a paid session cannot be paid again', async () => {
    const sessionId = await parkedSession('KA01AB1234');
    expect((await pay(driver, { sessionId, method: 'upi', upiId: UPI_ID })).status).toBe(201);

    const again = await pay(attendant, { sessionId, method: 'cash' });

    expect(again.status).toBe(409);
    expect(again.body.error).toBe('This session has already been paid');
    expect(await paymentRows()).toHaveLength(1);
  });

  test('two payments at the same moment record only one', async () => {
    const sessionId = await parkedSession('KA01AB1234');

    const results = await Promise.all([
      pay(driver, { sessionId, method: 'upi', upiId: UPI_ID }),
      pay(driver, { sessionId, method: 'upi', upiId: UPI_ID }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await paymentRows()).toHaveLength(1);
  });

  test('a vehicle that is still parked cannot be paid for yet', async () => {
    const sessionId = await parkedSession('KA01AB1234', { exited: false });

    const res = await pay(attendant, { sessionId, method: 'cash' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('This vehicle is still parked. Record its exit before payment.');
  });

  test('a UPI payment needs a valid UPI ID, and nothing is recorded without one', async () => {
    const sessionId = await parkedSession('KA01AB1234');

    for (const upiId of [undefined, '', 'arjun', 'arjun@', '@okaxis', 'ar jun@okaxis']) {
      const res = await pay(driver, { sessionId, method: 'upi', upiId });
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual({ upiId: 'Enter a UPI ID such as name@bank' });
    }
    expect(await paymentRows()).toEqual([]);
  });

  test('the UPI ID is never stored (NFR-18)', async () => {
    const sessionId = await parkedSession('KA01AB1234');
    expect((await pay(driver, { sessionId, method: 'upi', upiId: UPI_ID })).status).toBe(201);

    const [rows] = await db.query('SELECT * FROM payments');
    expect(JSON.stringify(rows)).not.toContain(UPI_ID);
  });

  test('a driver cannot choose cash', async () => {
    const sessionId = await parkedSession('KA01AB1234');

    const res = await pay(driver, { sessionId, method: 'cash' });

    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ method: 'Cash is paid to the attendant at the exit' });
  });

  test('a missing session or method is rejected', async () => {
    const res = await pay(attendant, {});

    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({
      sessionId: 'Choose a parking session to pay for',
      method: 'Choose a payment method',
    });
    expect((await pay(attendant, { sessionId: 999999, method: 'cash' })).status).toBe(404);
  });

  test('the stored payment never contains the full card number or the expiry (NFR-18)', async () => {
    const sessionId = await parkedSession('KA01AB1234');
    expect((await pay(driver, { sessionId, method: 'card', cardNumber: GOOD_CARD, cardExpiry: NEXT_YEAR_EXPIRY })).status).toBe(201);

    const [rows] = await db.query('SELECT * FROM payments');
    const stored = JSON.stringify(rows);

    expect(rows[0].card_last4).toBe('1111');
    expect(stored).not.toContain('4111111111111111');
    expect(stored).not.toContain(NEXT_YEAR_EXPIRY);
  });
});

describe('unpaid sessions', () => {
  test('a driver sees only their own sessions that are waiting for payment', async () => {
    const unpaid = await parkedSession('KA01AB1234', { fee: 40 });
    const paid = await parkedSession('KA03EF9012', { fee: 30 });
    await parkedSession('KA01AB1234', { exited: false });
    await parkedSession('KA02CD5678');
    expect((await pay(driver, { sessionId: paid, method: 'upi', upiId: UPI_ID })).status).toBe(201);

    const res = await driver.get('/api/payments/unpaid');

    expect(res.status).toBe(200);
    expect(res.body.sessions).toEqual([
      expect.objectContaining({ id: unpaid, registrationNumber: 'KA01AB1234', fee: 40, paymentStatus: 'unpaid', status: 'awaiting_payment' }),
    ]);
  });

  test('only drivers have an unpaid list', async () => {
    expect((await attendant.get('/api/payments/unpaid')).status).toBe(403);
    expect((await request(app).get('/api/payments/unpaid')).status).toBe(401);
  });
});

describe('a failed UPI payment, then cash later (UC-08)', () => {
  test('a declined UPI payment is recorded as failed and the session keeps waiting', async () => {
    const sessionId = await parkedSession('KA01AB1234', { fee: 40 });

    const res = await pay(attendant, { sessionId, method: 'upi', upiId: FAILING_UPI_ID });

    expect(res.status).toBe(402);
    expect(res.body.error).toBe('UPI payment failed. Try again or pay another way.');
    expect(await paymentRows()).toEqual([
      { sessionId, amount: 40, method: 'upi', status: 'failed', cardLast4: null, recordedBy: attendantUser.id },
    ]);
    expect(await sessionStatusOf(sessionId)).toBe('awaiting_payment');
    expect(await paymentStatusOf(sessionId)).toBe('unpaid');
  });

  test('the attendant finds the waiting vehicle and takes cash when the driver comes back', async () => {
    const sessionId = await parkedSession('KA01AB1234', { fee: 40 });
    expect((await pay(attendant, { sessionId, method: 'upi', upiId: FAILING_UPI_ID })).status).toBe(402);
    // The driver goes to fetch cash: move the whole stay 10 minutes into the past.
    await db.query(
      'UPDATE parking_sessions SET entry_time = entry_time - INTERVAL 10 MINUTE, exit_time = exit_time - INTERVAL 10 MINUTE WHERE id = ?',
      [sessionId],
    );

    const waiting = await attendant.get('/api/payments/awaiting');
    expect(waiting.status).toBe(200);
    expect(waiting.headers['cache-control']).toBe('no-store');
    expect(waiting.body.sessions).toEqual([
      expect.objectContaining({
        id: sessionId,
        registrationNumber: 'KA01AB1234',
        fee: 40,
        status: 'awaiting_payment',
        failedAttempts: 1,
      }),
    ]);
    // Exit was an hour ago in parkedSession, plus the 10 minutes above.
    expect(waiting.body.sessions[0].waitingMinutes).toBeGreaterThanOrEqual(70);

    const cash = await pay(attendant, { sessionId, method: 'cash' });

    // The fee was fixed at exit, so the wait costs nothing extra.
    expect(cash.status).toBe(201);
    expect(cash.body.payment).toMatchObject({ amount: 40, method: 'cash', status: 'paid' });
    expect(cash.body.session).toMatchObject({ status: 'completed', paymentStatus: 'paid' });
    expect(await sessionStatusOf(sessionId)).toBe('completed');
    expect((await attendant.get('/api/payments/awaiting')).body.sessions).toEqual([]);
  });

  test('the waiting list shows the longest wait first and leaves out parked and paid sessions', async () => {
    const recent = await parkedSession('KA01AB1234');
    const older = await parkedSession('KA02CD5678');
    await db.query(
      'UPDATE parking_sessions SET entry_time = entry_time - INTERVAL 30 MINUTE, exit_time = exit_time - INTERVAL 30 MINUTE WHERE id = ?',
      [older],
    );
    const paid = await parkedSession('KA03EF9012');
    expect((await pay(attendant, { sessionId: paid, method: 'cash' })).status).toBe(201);
    await parkedSession('KA01AB1234', { exited: false });

    const res = await admin.get('/api/payments/awaiting');

    expect(res.body.sessions.map((s) => s.id)).toEqual([older, recent]);
  });

  test('only staff see the waiting list', async () => {
    expect((await driver.get('/api/payments/awaiting')).status).toBe(403);
    expect((await request(app).get('/api/payments/awaiting')).status).toBe(401);
  });
});
