// Issue #3 (NFR-12): passwords are never stored in plaintext and bcrypt is used.
const util = require('node:util');
const request = require('supertest');
const app = require('../../server/src/app');
const { db, clearTables } = require('../helpers/db');

const arjun = { name: 'Arjun', email: 'arjun@example.com', password: 'Zq9!unique-Secret' };

beforeEach(clearTables);
afterAll(() => db.end());

const register = (body = arjun) => request(app).post('/api/auth/register').send(body);
const login = (body) => request(app).post('/api/auth/login').send(body);

async function storedHash(email = arjun.email) {
  const [[row]] = await db.query('SELECT password_hash FROM users WHERE email = ?', [email]);
  return row.password_hash;
}

describe('storage', () => {
  test('registration stores only a 60-character bcrypt hash', async () => {
    await register();
    const hash = await storedHash();
    expect(hash).toMatch(/^\$2[aby]\$10\$.{53}$/);
    expect(hash).toHaveLength(60);
  });

  test('the plaintext password appears in no column of the users table', async () => {
    await register();
    const [rows] = await db.query('SELECT * FROM users');
    expect(JSON.stringify(rows)).not.toContain(arjun.password);
  });

  test('two accounts with the same password get different hashes', async () => {
    await register();
    await register({ name: 'Second', email: 'second@example.com', password: arjun.password });
    expect(await storedHash('second@example.com')).not.toBe(await storedHash());
  });
});

describe('verification at login', () => {
  beforeEach(() => register());

  test('the correct password is accepted and a wrong one refused', async () => {
    expect((await login({ email: arjun.email, password: arjun.password })).status).toBe(200);
    expect((await login({ email: arjun.email, password: 'Zq9!wrong-Secret' })).status).toBe(401);
  });

  test('the stored hash cannot be used to log in', async () => {
    const res = await login({ email: arjun.email, password: await storedHash() });
    expect(res.status).toBe(401);
  });
});

describe('no leaks', () => {
  test('no response contains the password or its hash', async () => {
    const reg = await register();
    const agent = request.agent(app);
    const log = await agent.post('/api/auth/login').send({ email: arjun.email, password: arjun.password });
    const me = await agent.get('/api/auth/me');
    const everything = JSON.stringify([reg.body, log.body, me.body]);
    expect(everything).not.toContain(arjun.password);
    expect(everything).not.toContain(await storedHash());
  });

  test('the password is never written to the logs', async () => {
    const spies = ['log', 'info', 'warn', 'error'].map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
    try {
      await register();
      await login({ email: arjun.email, password: arjun.password });
      await login({ email: arjun.email, password: 'Zq9!wrong-Secret' });
      await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send(`{"email":"${arjun.email}","password":"${arjun.password}"`); // malformed JSON
      const logged = util.inspect(spies.flatMap((s) => s.mock.calls), { depth: 6 });
      expect(logged).not.toContain(arjun.password);
      expect(logged).not.toContain('Zq9!wrong-Secret');
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});