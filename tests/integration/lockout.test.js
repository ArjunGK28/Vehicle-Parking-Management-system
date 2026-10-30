// Issue #4 (NFR-13, ST-01_06): 5 consecutive failed logins lock the account temporarily.
const request = require('supertest');
const app = require('../../server/src/app');
const { db, clearTables } = require('../helpers/db');

jest.setTimeout(20000); // each wrong password costs one bcrypt comparison

const arjun = { name: 'Arjun', email: 'arjun@example.com', password: 'Abc@123' };
const good = { email: arjun.email, password: arjun.password };
const bad = { email: arjun.email, password: 'wrong-pass' };

const login = (body) => request(app).post('/api/auth/login').send(body);

async function failTimes(n) {
  for (let i = 0; i < n; i += 1) await login(bad); // one after another, as a real user would
}

function setLockedUntil(sqlExpression) {
  return db.query(`UPDATE users SET locked_until = ${sqlExpression} WHERE email = ?`, [arjun.email]);
}

beforeEach(async () => {
  await clearTables();
  await request(app).post('/api/auth/register').send(arjun);
});
afterAll(() => db.end());

describe('locking', () => {
  test('4 failed logins do not lock the account', async () => {
    for (let i = 0; i < 4; i += 1) expect((await login(bad)).status).toBe(401);
    expect((await login(good)).status).toBe(200);
  });

  test('ST-01_06: the 5th consecutive failed login locks the account with a clear message', async () => {
    for (let i = 0; i < 4; i += 1) expect((await login(bad)).status).toBe(401);
    const res = await login(bad);
    expect(res.status).toBe(423);
    expect(res.body.error).toMatch(/locked/i);
    expect(res.body.error).toMatch(/15 minutes/);
  });

  test('a locked account refuses even the correct password and opens no session', async () => {
    await failTimes(5);
    const res = await login(good);
    expect(res.status).toBe(423);
    expect(res.body.error).toMatch(/locked/i);
    expect(res.headers['set-cookie']).toBeUndefined();
    const [[{ count }]] = await db.query('SELECT COUNT(*) AS count FROM auth_sessions');
    expect(count).toBe(0);
  });

  test('the message shows the remaining time', async () => {
    await failTimes(5);
    await setLockedUntil('DATE_ADD(UTC_TIMESTAMP(), INTERVAL 90 SECOND)');
    const res = await login(good);
    expect(res.status).toBe(423);
    expect(res.body.error).toMatch(/2 minutes/);
  });

  test('locking one account does not affect another', async () => {
    const other = { name: 'Other', email: 'other@example.com', password: 'Abc@123' };
    await request(app).post('/api/auth/register').send(other);
    await failTimes(5);
    expect((await login({ email: other.email, password: other.password })).status).toBe(200);
  });

  test('an unknown email is never locked and always gets the usual error', async () => {
    for (let i = 0; i < 6; i += 1) {
      const res = await login({ email: 'nobody@example.com', password: 'wrong-pass' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    }
  });
});

describe('recovery', () => {
  test('a successful login resets the failed-attempt counter', async () => {
    await failTimes(4);
    expect((await login(good)).status).toBe(200);
    await failTimes(4); // would be the 8th in a row if the counter had not been reset
    expect((await login(good)).status).toBe(200);
  });

  test('the lock ends when the lock period is over', async () => {
    await failTimes(5);
    await setLockedUntil('DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 SECOND)');
    expect((await login(good)).status).toBe(200);
    const [[row]] = await db.query(
      'SELECT failed_login_attempts, locked_until FROM users WHERE email = ?',
      [arjun.email],
    );
    expect(row.failed_login_attempts).toBe(0);
    expect(row.locked_until).toBeNull();
  });

  test('after a lock ends the user gets a fresh set of 5 attempts', async () => {
    await failTimes(5);
    await setLockedUntil('DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 SECOND)');
    for (let i = 0; i < 4; i += 1) expect((await login(bad)).status).toBe(401);
    expect((await login(good)).status).toBe(200);
  });
});

describe('response', () => {
  test('lockout fields are not returned to the client', async () => {
    const res = await login(good);
    expect(res.status).toBe(200);
    for (const key of ['passwordHash', 'failedLoginAttempts', 'lockedUntil', 'isLocked', 'lockSecondsLeft']) {
      expect(res.body.user).not.toHaveProperty(key);
    }
  });
});