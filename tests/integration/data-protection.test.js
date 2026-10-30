// Issue #47 (NFR-18): unauthorized users cannot access confidential user or payment data.
// Four checks: every route says who may call it, one user cannot reach another user's data,
// confidential values never come back in a response or reach the database or the logs, and
// private responses are marked so browsers do not keep them.
const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');
const request = require('supertest');
const app = require('../../server/src/app');
const { ROLES } = require('../../server/src/modules/users/roles');
const { db, clearTables } = require('../helpers/db');
const { createUser, loginAs, TEST_PASSWORD } = require('../helpers/users');

jest.setTimeout(60000);

const { DRIVER, ATTENDANT, ADMIN } = ROLES;
const EVERYONE = [DRIVER, ATTENDANT, ADMIN];
const PUBLIC = null; // no login needed

// Every API route and the roles allowed to call it. Adding a route to the server without
// adding it here fails the "inventory" test below, so no route can be forgotten.
const ROUTES = [
  ['POST', '/api/auth/register', PUBLIC],
  ['POST', '/api/auth/login', PUBLIC],
  ['POST', '/api/auth/logout', PUBLIC],
  ['GET', '/api/auth/me', EVERYONE],

  ['GET', '/api/vehicles', [DRIVER]],
  ['GET', '/api/vehicles/:id', [DRIVER]],
  ['POST', '/api/vehicles', [DRIVER]],
  ['PUT', '/api/vehicles/:id', [DRIVER]],
  ['DELETE', '/api/vehicles/:id', [DRIVER]],

  ['GET', '/api/slots', EVERYONE],
  ['POST', '/api/slots', [ADMIN]],
  ['PATCH', '/api/slots/:id', [ADMIN]],

  ['GET', '/api/reservations', EVERYONE],
  ['POST', '/api/reservations', EVERYONE],

  ['POST', '/api/parking/assign', [DRIVER, ATTENDANT]],
  ['POST', '/api/parking/entry', [ATTENDANT]],
  ['POST', '/api/parking/exit', [ATTENDANT, ADMIN]],
  ['GET', '/api/parking/locate', [ATTENDANT, ADMIN]],

  ['GET', '/api/rates', [ADMIN]],
  ['PUT', '/api/rates/:type', [ADMIN]],

  ['GET', '/api/admin/users', [ADMIN]],
  ['POST', '/api/admin/users', [ADMIN]],
  ['DELETE', '/api/admin/users/:id', [ADMIN]],
  ['GET', '/api/admin/users/:id/vehicles', [ADMIN]],
  ['PUT', '/api/admin/vehicles/:id', [ADMIN]],
  ['DELETE', '/api/admin/vehicles/:id', [ADMIN]],

  ['GET', '/api/history', [DRIVER]],
  ['GET', '/api/history/users/:id', [ADMIN]],

  ['GET', '/api/payments/methods', EVERYONE],
  ['POST', '/api/payments', EVERYONE],
  ['GET', '/api/payments/unpaid', [DRIVER]],

  ['GET', '/api/audit', [ADMIN]],
  ['GET', '/api/reports/occupancy', [ADMIN]],
];

// An id and a type that do not exist, so calling a route as an allowed role changes nothing.
const concrete = (route) => route.replace(':id', '999999').replace(':type', 'truck');

let agents;
let anonymous;

beforeAll(async () => {
  await clearTables();
  anonymous = request(app);
  agents = {
    [DRIVER]: await loginAs(await createUser(DRIVER)),
    [ATTENDANT]: await loginAs(await createUser(ATTENDANT)),
    [ADMIN]: await loginAs(await createUser(ADMIN)),
  };
});

afterAll(() => db.end());

describe('every route says who may call it', () => {
  test('the list above matches the routes in the server code', () => {
    const src = path.join(__dirname, '..', '..', 'server', 'src');
    const appSource = fs.readFileSync(path.join(src, 'app.js'), 'utf8');

    // app.use('/api/slots', slotsRoutes)  +  const slotsRoutes = require('./modules/slots/slots.routes')
    const mounts = [...appSource.matchAll(/app\.use\('(\/api\/[\w-]+)',\s*(\w+)\)/g)].map(([, prefix, name]) => {
      const file = new RegExp(`const ${name} = require\\('([^']+)'\\)`).exec(appSource)[1];
      return { prefix, file: path.join(src, `${file}.js`) };
    });

    const found = [];
    for (const { prefix, file } of mounts) {
      const text = fs.readFileSync(file, 'utf8');
      for (const [, method, route] of text.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']*)'/g)) {
        found.push(`${method.toUpperCase()} ${prefix}${route === '/' ? '' : route}`);
      }
    }

    const listed = ROUTES.map(([method, route]) => `${method} ${route}`);
    expect(found.length).toBeGreaterThan(25);
    expect(found.sort()).toEqual(listed.sort());
  });

  const protectedRoutes = ROUTES.filter(([, , roles]) => roles !== PUBLIC);

  test.each(protectedRoutes)('%s %s without a login gives 401', async (method, route) => {
    const res = await anonymous[method.toLowerCase()](concrete(route)).send({});
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Please log in to continue' });
  });

  const refusals = protectedRoutes.flatMap(([method, route, roles]) =>
    EVERYONE.filter((role) => !roles.includes(role)).map((role) => [method, route, role]),
  );

  test.each(refusals)('%s %s is refused for a %s with 403', async (method, route, role) => {
    const res = await agents[role][method.toLowerCase()](concrete(route)).send({});
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'You do not have permission to do this' });
  });

  const permitted = protectedRoutes.flatMap(([method, route, roles]) => roles.map((role) => [method, route, role]));

  test.each(permitted)('%s %s is open to a %s (passes the access check)', async (method, route, role) => {
    const res = await agents[role][method.toLowerCase()](concrete(route)).send({});
    expect([401, 403]).not.toContain(res.status);
  });

  test('registration, login and logout need no login', async () => {
    expect((await anonymous.post('/api/auth/register').send({})).status).toBe(400);
    expect((await anonymous.post('/api/auth/login').send({})).status).toBe(400);
    expect((await anonymous.post('/api/auth/logout')).status).toBe(204);
  });
});

describe("one user cannot reach another user's data", () => {
  let driverA;
  let driverB;
  let attendant;
  let admin;
  let userA;
  let vehicleA;
  let vehicleB;
  let sessionA;
  let sessionB;

  async function vehicleFor(agent, registrationNumber) {
    const res = await agent.post('/api/vehicles').send({ registrationNumber, type: 'four_wheeler', model: 'Swift', colour: 'Red' });
    expect(res.status).toBe(201);
    return res.body.vehicle.id;
  }

  // A finished, unpaid stay of 1 hour with a fee of 40.
  async function unpaidStay(vehicleId, code) {
    const [slot] = await db.query("INSERT INTO parking_slots (code, slot_type) VALUES (?, 'four_wheeler')", [code]);
    const [session] = await db.query(
      `INSERT INTO parking_sessions (vehicle_id, slot_id, entry_time, exit_time, status, fee_amount, billed_minutes)
       VALUES (?, ?, NOW() - INTERVAL 2 HOUR, NOW() - INTERVAL 1 HOUR, 'completed', 40, 60)`,
      [vehicleId, slot.insertId],
    );
    return session.insertId;
  }

  beforeAll(async () => {
    await clearTables();
    userA = await createUser(DRIVER, { email: 'a@example.com' });
    driverA = await loginAs(userA);
    driverB = await loginAs(await createUser(DRIVER, { email: 'b@example.com' }));
    attendant = await loginAs(await createUser(ATTENDANT));
    admin = await loginAs(await createUser(ADMIN));

    vehicleA = await vehicleFor(driverA, 'KA01AB1111');
    vehicleB = await vehicleFor(driverB, 'KA02CD2222');
    sessionA = await unpaidStay(vehicleA, 'P-1');
    sessionB = await unpaidStay(vehicleB, 'P-2');
  });

  test("another driver cannot read, change or delete a driver's vehicle", async () => {
    expect((await driverB.get(`/api/vehicles/${vehicleA}`)).status).toBe(404);
    expect((await driverB.put(`/api/vehicles/${vehicleA}`).send({ registrationNumber: 'KA99ZZ9999', type: 'four_wheeler', model: 'X', colour: 'Y' })).status).toBe(404);
    expect((await driverB.delete(`/api/vehicles/${vehicleA}`)).status).toBe(404);

    const [[row]] = await db.query('SELECT registration_number AS plate FROM vehicles WHERE id = ?', [vehicleA]);
    expect(row.plate).toBe('KA01AB1111');
  });

  test("a driver's vehicle list holds only their own vehicles", async () => {
    const res = await driverB.get('/api/vehicles');
    expect(res.body.vehicles.map((v) => v.registrationNumber)).toEqual(['KA02CD2222']);
  });

  test("another driver's vehicle cannot be parked or reserved by someone else", async () => {
    expect((await driverB.post('/api/parking/assign').send({ vehicleId: vehicleA })).status).toBe(404);

    const reserve = await driverB.post('/api/reservations').send({
      vehicleId: vehicleA,
      slotId: 1,
      startTime: '2030-01-10T10:00:00',
      endTime: '2030-01-10T11:00:00',
    });
    expect(reserve.status).toBe(404);
  });

  test("another driver cannot pay for a driver's session, and gets the same answer as for a missing one", async () => {
    const theirs = await driverB.post('/api/payments').send({ sessionId: sessionA, method: 'upi' });
    const missing = await driverB.post('/api/payments').send({ sessionId: 999999, method: 'upi' });

    expect(theirs.status).toBe(404);
    expect(theirs.body).toEqual(missing.body);
    const [[row]] = await db.query('SELECT payment_status AS status FROM parking_sessions WHERE id = ?', [sessionA]);
    expect(row.status).toBe('unpaid');
    const [[{ count }]] = await db.query('SELECT COUNT(*) AS count FROM payments');
    expect(count).toBe(0);
  });

  test("history, unpaid sessions and reservations show only the logged-in driver's own", async () => {
    const history = await driverB.get('/api/history');
    expect(history.body.sessions.map((s) => s.registrationNumber)).toEqual(['KA02CD2222']);

    const unpaid = await driverB.get('/api/payments/unpaid');
    expect(unpaid.body.sessions.map((s) => s.id)).toEqual([sessionB]);

    const mine = await driverA.get('/api/reservations');
    expect(mine.body.reservations).toEqual([]);
  });

  test("a driver cannot open another user's history, and an attendant cannot open any history or payments list", async () => {
    expect((await driverB.get(`/api/history/users/${userA.id}`)).status).toBe(403);
    expect((await attendant.get('/api/history')).status).toBe(403);
    expect((await attendant.get(`/api/history/users/${userA.id}`)).status).toBe(403);
    expect((await attendant.get('/api/payments/unpaid')).status).toBe(403);
  });

  test("only an administrator can list users, read a user's vehicles or read a user's history", async () => {
    for (const agent of [driverB, attendant]) {
      expect((await agent.get('/api/admin/users')).status).toBe(403);
      expect((await agent.get(`/api/admin/users/${userA.id}/vehicles`)).status).toBe(403);
      expect((await agent.get(`/api/history/users/${userA.id}`)).status).toBe(403);
    }
    expect((await admin.get(`/api/history/users/${userA.id}`)).body.sessions.map((s) => s.id)).toEqual([sessionA]);
  });

  test('the audit log and the reports are for administrators only', async () => {
    for (const agent of [driverA, driverB, attendant]) {
      expect((await agent.get('/api/audit')).status).toBe(403);
      expect((await agent.get('/api/reports/occupancy?from=2026-10-01&to=2026-10-31')).status).toBe(403);
    }
    expect((await anonymous.get('/api/audit')).status).toBe(401);
    expect((await anonymous.get('/api/reports/occupancy?from=2026-10-01&to=2026-10-31')).status).toBe(401);
  });
});

describe('confidential values never come back, and are never stored or logged', () => {
  const CARD = '4111 1111 1111 1111';
  const CARD_DIGITS = '4111111111111111';
  const EXPIRY = '12/40';
  const NEW_USER_PASSWORD = 'Zq9!Audit-Secret';
  const FORBIDDEN = ['passwordHash', 'password_hash', '$2b$', '$2a$', 'tokenHash', 'token_hash', 'failedLoginAttempts', 'lockedUntil', 'isLocked', 'lockSecondsLeft'];

  let driver;
  let admin;
  let attendant;
  let sessionToken;
  let sessionId;
  const bodies = [];
  const logged = [];
  let spies;

  const record = (res) => {
    bodies.push(res.text || '');
    return res;
  };

  beforeAll(async () => {
    await clearTables();
    await db.query(
      "INSERT INTO parking_rates (slot_type, hourly_rate, minimum_fee, billing_step_minutes) VALUES ('four_wheeler', 20, 10, 15), ('two_wheeler', 10, 5, 15)",
    );
    const driverUser = await createUser(DRIVER);
    driver = await loginAs(driverUser);
    admin = await loginAs(await createUser(ADMIN));
    attendant = await loginAs(await createUser(ATTENDANT));

    const login = await request(app).post('/api/auth/login').send({ email: driverUser.email, password: TEST_PASSWORD });
    sessionToken = login.headers['set-cookie'][0].split(';')[0].split('=')[1];
    record(login);

    const vehicle = await driver.post('/api/vehicles').send({ registrationNumber: 'KA03EF3333', type: 'four_wheeler', model: 'Swift', colour: 'Red' });
    await admin.post('/api/slots').send({ code: 'P-1', type: 'four_wheeler' });

    spies = ['log', 'info', 'warn', 'error'].map((m) => jest.spyOn(console, m).mockImplementation((...args) => logged.push(util.inspect(args, { depth: 8 }))));

    expect((await attendant.post('/api/parking/entry').send({ registrationNumber: 'KA03EF3333' })).status).toBe(201);
    expect((await attendant.post('/api/parking/exit').send({ registrationNumber: 'KA03EF3333' })).status).toBe(200);
    const unpaid = record(await driver.get('/api/payments/unpaid'));
    sessionId = unpaid.body.sessions[0].id;

    const paid = record(await driver.post('/api/payments').send({ sessionId, method: 'card', cardNumber: CARD, cardExpiry: EXPIRY }));
    expect(paid.status).toBe(201);
    record(await driver.post('/api/auth/login').send({ email: driverUser.email, password: 'wrong-pass' }));

    // An administrator action that is written to the audit log, with a password in the request.
    const added = record(await admin.post('/api/admin/users').send({ name: 'Gate Two', email: 'gate2@example.com', password: NEW_USER_PASSWORD, role: 'attendant' }));
    expect(added.status).toBe(201);

    for (const [agent, urls] of [
      [driver, ['/api/auth/me', '/api/vehicles', `/api/vehicles/${vehicle.body.vehicle.id}`, '/api/history', '/api/reservations', '/api/payments/methods', '/api/slots']],
      [attendant, ['/api/auth/me', '/api/parking/locate?registrationNumber=KA03EF3333', '/api/slots']],
      [admin, ['/api/auth/me', '/api/admin/users', `/api/admin/users/${driverUser.id}/vehicles`, `/api/history/users/${driverUser.id}`, '/api/rates', '/api/slots', '/api/audit', '/api/reports/occupancy?from=2026-10-01&to=2026-10-31']],
    ]) {
      for (const url of urls) record(await agent.get(url));
    }
  });

  afterAll(() => spies.forEach((spy) => spy.mockRestore()));

  test('no response holds a password hash, a lockout field, a session token or card details', () => {
    expect(bodies.length).toBeGreaterThan(15);
    const everything = bodies.join('\n');
    for (const value of [...FORBIDDEN, sessionToken, CARD_DIGITS, CARD, EXPIRY, TEST_PASSWORD, NEW_USER_PASSWORD]) {
      expect(everything).not.toContain(value);
    }
  });

  test('the payment response shows only the last 4 card digits', async () => {
    const [[payment]] = await db.query('SELECT id FROM payments LIMIT 1');
    const res = await driver.get('/api/payments/unpaid'); // the session is paid now
    expect(res.body.sessions).toEqual([]);
    expect(payment.id).toBeGreaterThan(0);
    const history = await driver.get('/api/history');
    expect(JSON.stringify(history.body)).not.toMatch(/1111/);
  });

  test('the database keeps only the last 4 card digits and never the expiry', async () => {
    const [[payment]] = await db.query('SELECT card_last4 AS last4, amount, method, status FROM payments');
    expect(payment).toMatchObject({ last4: '1111', method: 'card', status: 'paid' });

    const [tables] = await db.query('SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()');
    let dump = '';
    for (const { name } of tables) {
      const [rows] = await db.query('SELECT * FROM ??', [name]);
      dump += JSON.stringify(rows);
    }
    for (const value of [CARD_DIGITS, CARD, EXPIRY, TEST_PASSWORD, NEW_USER_PASSWORD, sessionToken]) expect(dump).not.toContain(value);
  });

  test('the audit log records who did what, but never a password', async () => {
    const res = await admin.get('/api/audit');

    expect(res.status).toBe(200);
    expect(res.body.entries.map((e) => e.summary)).toEqual(expect.arrayContaining([expect.stringContaining('gate2@example.com')]));
    expect(JSON.stringify(res.body)).not.toContain(NEW_USER_PASSWORD);
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/);

    const [rows] = await db.query('SELECT * FROM audit_log');
    expect(JSON.stringify(rows)).not.toContain(NEW_USER_PASSWORD);
    expect(JSON.stringify(rows)).not.toMatch(/\$2[aby]\$/);
  });

  test('the password, session token and card details are not in the server logs', () => {
    const everything = logged.join('\n');
    for (const value of [TEST_PASSWORD, NEW_USER_PASSWORD, 'wrong-pass', sessionToken, CARD_DIGITS, CARD, EXPIRY]) {
      expect(everything).not.toContain(value);
    }
  });

  test('a database error does not write the SQL, with its values, to the log', async () => {
    const before = logged.length;
    const dbError = Object.assign(new Error('connection lost'), {
      code: 'ER_LOCK_DEADLOCK',
      sql: "INSERT INTO users (name, email, password_hash, role) VALUES ('Eve', 'eve@example.com', '$2b$10$SECRETHASHVALUE', 'driver')",
      sqlMessage: 'connection lost',
    });
    const spy = jest.spyOn(db, 'query').mockRejectedValueOnce(dbError);
    try {
      const res = await request(app).post('/api/auth/register').send({ name: 'Eve', email: 'eve@example.com', password: 'Abc@123' });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Something went wrong. Please try again.' });
    } finally {
      spy.mockRestore();
    }

    const written = logged.slice(before).join('\n');
    expect(written).toContain('connection lost'); // the error is still logged, so it can be fixed
    expect(written).not.toContain('SECRETHASHVALUE');
    expect(written).not.toContain('eve@example.com');
  });
});

describe('private responses are marked so browsers and proxies do not keep them', () => {
  const cases = [
    ['a data response', (a) => a[DRIVER].get('/api/vehicles')],
    ['the profile', (a) => a[DRIVER].get('/api/auth/me')],
    ['a list of users', (a) => a[ADMIN].get('/api/admin/users')],
    ['the audit log', (a) => a[ADMIN].get('/api/audit')],
    ['a report', (a) => a[ADMIN].get('/api/reports/occupancy?from=2026-10-01&to=2026-10-31')],
    ['a reservations list', (a) => a[DRIVER].get('/api/reservations')],
    ['a refusal (401)', () => anonymous.get('/api/vehicles')],
    ['a refusal (403)', (a) => a[ATTENDANT].get('/api/admin/users')],
    ['a missing route (404)', () => anonymous.get('/api/does-not-exist')],
    ['a validation error (400)', () => anonymous.post('/api/auth/login').send({})],
    ['a request with broken JSON (400)', () => anonymous.post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": ')],
    ['the health check', () => anonymous.get('/api/health')],
  ];

  test.each(cases)('%s is not cacheable and carries the security headers', async (name, call) => {
    const res = await call(agents);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers).not.toHaveProperty('x-powered-by');
  });

  test('the session cookie cannot be read by page scripts or sent from other sites', async () => {
    const res = await anonymous.post('/api/auth/login').send({ email: 'driver@example.com', password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    expect(res.headers['set-cookie'][0]).toMatch(/SameSite=Strict/);
  });
});