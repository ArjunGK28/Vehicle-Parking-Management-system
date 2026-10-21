const request = require('supertest');
const app = require('../../server/src/app');
const users = require('../../server/src/modules/users/users.repository');
const { hashPassword } = require('../../server/src/modules/users/password');

const TEST_PASSWORD = 'Abc@123';

// Inserts a user straight into the database, so tests can create attendants and
// admins (registration only ever creates drivers).
async function createUser(role, overrides = {}) {
  const user = {
    name: `Test ${role}`,
    email: `${role}@example.com`,
    password: TEST_PASSWORD,
    ...overrides,
  };
  const id = await users.create({
    name: user.name,
    email: user.email,
    passwordHash: await hashPassword(user.password),
    role,
  });
  return { ...user, id, role };
}

// Returns a supertest agent that carries the user's session cookie.
async function loginAs(user, server = app) {
  const agent = request.agent(server);
  const res = await agent.post('/api/auth/login').send({ email: user.email, password: user.password });
  if (res.status !== 200) throw new Error(`login failed for ${user.email}: ${res.status}`);
  return agent;
}

module.exports = { createUser, loginAs, TEST_PASSWORD };
