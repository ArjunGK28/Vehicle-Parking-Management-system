// Issue #46 (NFR-15): all input is validated before processing; invalid input is rejected with a clear message.
const request = require('supertest');
const app = require('../../server/src/app');
const { db, clearTables } = require('../helpers/db');

beforeEach(clearTables);
afterAll(() => db.end());

const valid = { name: 'Arjun', email: 'arjun@example.com', password: 'Abc@123' };
const post = (path) => request(app).post(path);

async function userCount() {
  const [[{ count }]] = await db.query('SELECT COUNT(*) AS count FROM users');
  return count;
}

describe('registration input', () => {
  test('an empty body is rejected per field and nothing is stored', async () => {
    const res = await post('/api/auth/register').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Please correct the highlighted fields');
    expect(Object.keys(res.body.fields).sort()).toEqual(['email', 'name', 'password']);
    expect(await userCount()).toBe(0);
  });

  test('a request with no body at all is rejected', async () => {
    const res = await post('/api/auth/register');
    expect(res.status).toBe(400);
    expect(await userCount()).toBe(0);
  });

  test('values of the wrong type are rejected', async () => {
    const res = await post('/api/auth/register').send({ name: 42, email: ['a@b.co'], password: { p: 1 } });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(['email', 'name', 'password']);
    expect(await userCount()).toBe(0);
  });

  test('a password over 72 bytes is rejected', async () => {
    const res = await post('/api/auth/register').send({ ...valid, password: 'x'.repeat(73) });
    expect(res.status).toBe(400);
    expect(res.body.fields.password).toBe('Password is too long');
    expect(await userCount()).toBe(0);
  });

  test('a name that is too short is rejected', async () => {
    const res = await post('/api/auth/register').send({ ...valid, name: 'A' });
    expect(res.status).toBe(400);
    expect(res.body.fields.name).toBe('Name must be 2 to 100 characters');
  });
});

describe('login input', () => {
  test('an empty email and password are rejected with field messages', async () => {
    const res = await post('/api/auth/login').send({ email: '', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ email: 'Email is required', password: 'Password is required' });
  });

  test('a password over 72 bytes is rejected', async () => {
    const res = await post('/api/auth/login').send({ email: valid.email, password: 'x'.repeat(73) });
    expect(res.status).toBe(400);
    expect(res.body.fields.password).toBe('Password is too long');
  });
});

describe('request body', () => {
  test('malformed JSON gets a clear 400', async () => {
    const res = await post('/api/auth/register').set('Content-Type', 'application/json').send('{"name": ');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Request body is not valid JSON');
  });

  test('a body over the size limit gets a clear 413, not a 500', async () => {
    const res = await post('/api/auth/register').send({ ...valid, password: 'x'.repeat(200 * 1024) });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('Request body is too large');
  });
});

describe('session cookie input', () => {
  test('a cookie that parses to an object is treated as not logged in', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'sid=j:{"a":1}');
    expect(res.status).toBe(401);
  });

  test('logout with such a cookie still succeeds', async () => {
    const res = await post('/api/auth/logout').set('Cookie', 'sid=j:{"a":1}');
    expect(res.status).toBe(204);
  });
});