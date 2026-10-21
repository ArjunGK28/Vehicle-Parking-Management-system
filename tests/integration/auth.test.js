// Story #2 (FR-01, UC-01): register and log in.
// Test IDs refer to the Test Plan document.
const request = require('supertest');
const app = require('../../server/src/app');
const { db, clearTables } = require('../helpers/db');

const arjun = { name: 'Arjun', email: 'arjun@example.com', password: 'Abc@123' };

beforeEach(clearTables);
afterAll(() => db.end());

function register(body = arjun) {
  return request(app).post('/api/auth/register').send(body);
}

describe('registration', () => {
  test('UT_01: valid details create an account with a confirmation', async () => {
    const res = await register();
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/account created/i);
    expect(res.body.user).toMatchObject({ name: 'Arjun', email: 'arjun@example.com', role: 'driver' });
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  test('the password is stored only as a bcrypt hash', async () => {
    await register();
    const [[row]] = await db.query('SELECT password_hash FROM users WHERE email = ?', [arjun.email]);
    expect(row.password_hash).not.toBe(arjun.password);
    expect(row.password_hash).toMatch(/^\$2[aby]\$/);
  });

  test('IT_02: a duplicate email is rejected', async () => {
    await register();
    const res = await register({ ...arjun, name: 'Someone Else', email: 'ARJUN@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.fields.email).toBe('Email is already in use');
  });

  test('IT_03: a malformed email (abc@com) is rejected', async () => {
    const res = await register({ ...arjun, email: 'abc@com' });
    expect(res.status).toBe(400);
    expect(res.body.fields.email).toBe('Enter a valid email address');
    const [[{ count }]] = await db.query('SELECT COUNT(*) AS count FROM users');
    expect(count).toBe(0);
  });

  test('a new account is always a driver, even if another role is sent', async () => {
    const res = await register({ ...arjun, role: 'admin' });
    expect(res.body.user.role).toBe('driver');
  });
});

describe('login', () => {
  beforeEach(() => register());

  test('UT_02: correct credentials log in and open a session', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ email: arjun.email, password: arjun.password });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Arjun', role: 'driver' });
    expect(res.headers['set-cookie'][0]).toMatch(/^sid=.+; Path=\/; HttpOnly; SameSite=Strict/);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(arjun.email);
  });

  test('IT_01: a wrong password shows an error and denies access', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: arjun.email, password: 'wrong-pass' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('an unknown email gets the same error as a wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'Abc@123' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  test('only a hash of the session token is stored', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: arjun.email, password: arjun.password });
    const token = res.headers['set-cookie'][0].split(';')[0].split('=')[1];
    const [[row]] = await db.query('SELECT token_hash FROM auth_sessions');
    expect(row.token_hash).toHaveLength(64);
    expect(row.token_hash).not.toBe(token);
  });
});

describe('session', () => {
  test('protected requests without a session are refused', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('a made-up session token is refused', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'sid=forged-token');
    expect(res.status).toBe(401);
  });

  test('logout ends the session', async () => {
    await register();
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: arjun.email, password: arjun.password });

    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    const [[{ count }]] = await db.query('SELECT COUNT(*) AS count FROM auth_sessions');
    expect(count).toBe(0);
  });
});
