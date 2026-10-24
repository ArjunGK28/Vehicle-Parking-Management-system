// Issue #5 (NFR-14): a session ends after 15 minutes of inactivity.
const request = require('supertest');
const app = require('../../server/src/app');
const { ROLES } = require('../../server/src/modules/users/roles');
const { db, clearTables } = require('../helpers/db');
const { createUser, loginAs, TEST_PASSWORD } = require('../helpers/users');

let admin;

beforeEach(async () => {
  await clearTables();
  admin = await loginAs(await createUser(ROLES.ADMIN));
});
afterAll(() => db.end());

// Pretends the person's last activity was this many minutes ago.
const ageSession = (minutes) =>
  db.query('UPDATE auth_sessions SET last_seen_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? MINUTE)', [minutes]);

async function idleSeconds() {
  const [[row]] = await db.query(
    'SELECT TIMESTAMPDIFF(SECOND, last_seen_at, CURRENT_TIMESTAMP) AS idle FROM auth_sessions',
  );
  return Number(row.idle);
}

async function sessionCount() {
  const [[{ count }]] = await db.query('SELECT COUNT(*) AS count FROM auth_sessions');
  return count;
}

describe('inactivity timeout', () => {
  test('a session idle for 14 minutes still works', async () => {
    await ageSession(14);
    const res = await admin.get('/api/auth/me');
    expect(res.status).toBe(200);
  });

  test('a session idle for 16 minutes is refused with 401 and deleted', async () => {
    await ageSession(16);
    const res = await admin.get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Please log in to continue');
    expect(await sessionCount()).toBe(0);
  });

  test('a session idle for exactly 15 minutes is refused', async () => {
    await ageSession(15);
    expect((await admin.get('/api/auth/me')).status).toBe(401);
  });

  test('an expired session is refused on role-protected routes too (401, not 403)', async () => {
    await ageSession(20);
    const res = await admin.get('/api/slots');
    expect(res.status).toBe(401);
  });

  test('an expired session stays refused on the next request', async () => {
    await ageSession(20);
    await admin.get('/api/auth/me');
    expect((await admin.get('/api/auth/me')).status).toBe(401);
  });

  test('the user can log in again after expiry', async () => {
    await ageSession(20);
    expect((await admin.get('/api/auth/me')).status).toBe(401);

    const login = await admin.post('/api/auth/login').send({ email: 'admin@example.com', password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect((await admin.get('/api/auth/me')).status).toBe(200);
  });

  test('logging out with an expired session still succeeds', async () => {
    await ageSession(20);
    expect((await admin.post('/api/auth/logout')).status).toBe(204);
  });
});

describe('activity keeps the session alive', () => {
  test('a normal request restarts the idle clock', async () => {
    await ageSession(14);
    expect((await admin.get('/api/auth/me')).status).toBe(200);
    expect(await idleSeconds()).toBeLessThan(10);
  });

  test('a background refresh is allowed but does not extend the session', async () => {
    await ageSession(14);
    const res = await admin.get('/api/auth/me').set('X-Background-Refresh', 'true');
    expect(res.status).toBe(200);
    expect(await idleSeconds()).toBeGreaterThanOrEqual(14 * 60);
  });

  test('a background refresh cannot revive an expired session', async () => {
    await ageSession(16);
    const res = await admin.get('/api/auth/me').set('X-Background-Refresh', 'true');
    expect(res.status).toBe(401);
  });
});

describe('other sessions', () => {
  test('one expired session does not end another user’s session', async () => {
    const other = await loginAs(await createUser(ROLES.DRIVER));
    const [[adminRow]] = await db.query('SELECT id FROM users WHERE role = ?', [ROLES.ADMIN]);
    await db.query(
      'UPDATE auth_sessions SET last_seen_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 20 MINUTE) WHERE user_id = ?',
      [adminRow.id],
    );
    expect((await admin.get('/api/auth/me')).status).toBe(401);
    expect((await other.get('/api/auth/me')).status).toBe(200);
  });

  test('a made-up cookie is still refused', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'sid=forged-token');
    expect(res.status).toBe(401);
  });
});