// Story #6 (NFR-10, NFR-11): authentication and role-based authorization.
// The real feature routes (tracking, slots, reports) arrive in later stories, so these
// tests mount sample routes guarded exactly the way those routes will be.
const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const app = require('../../server/src/app');
const { allowRoles } = require('../../server/src/middleware/requireRole');
const { errorHandler } = require('../../server/src/middleware/errorHandler');
const { ROLES } = require('../../server/src/modules/users/roles');
const { db, clearTables } = require('../helpers/db');
const { createUser, loginAs } = require('../helpers/users');

const ok = (req, res) => res.json({ ok: true, role: req.user.role });

const server = express();
server.use(cookieParser());
server.get('/sample/driver', allowRoles(ROLES.DRIVER), ok);
server.get('/sample/staff', allowRoles(ROLES.ATTENDANT, ROLES.ADMIN), ok); // e.g. track vehicle (UC-07)
server.get('/sample/admin', allowRoles(ROLES.ADMIN), ok); // e.g. manage slots (UC-12)
server.use(app);
server.use(errorHandler);

const access = {
  driver: { '/sample/driver': 200, '/sample/staff': 403, '/sample/admin': 403 },
  attendant: { '/sample/driver': 403, '/sample/staff': 200, '/sample/admin': 403 },
  admin: { '/sample/driver': 403, '/sample/staff': 200, '/sample/admin': 200 },
};

let agents;

beforeAll(async () => {
  await clearTables();
  agents = {};
  for (const role of Object.values(ROLES)) {
    agents[role] = await loginAs(await createUser(role), server);
  }
});

afterAll(() => db.end());

describe('NFR-10: protected functions need a login', () => {
  test.each(['/sample/driver', '/sample/staff', '/sample/admin', '/api/auth/me'])(
    '%s without a session is refused with 401',
    async (path) => {
      const res = await request(server).get(path);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Please log in to continue');
    },
  );
});

describe('NFR-11: each role has distinct access', () => {
  for (const [role, expected] of Object.entries(access)) {
    for (const [path, status] of Object.entries(expected)) {
      test(`${role} → ${path} gives ${status}`, async () => {
        const res = await agents[role].get(path);
        expect(res.status).toBe(status);
        if (status === 200) expect(res.body.role).toBe(role);
        else expect(res.body.error).toBe('You do not have permission to do this');
      });
    }
  }

  test('IT_20: a driver trying a staff-only action (track vehicle) is denied', async () => {
    const res = await agents.driver.get('/sample/staff');
    expect(res.status).toBe(403);
  });

  test('every role can still see its own profile', async () => {
    for (const role of Object.values(ROLES)) {
      const res = await agents[role].get('/api/auth/me');
      expect(res.body.user.role).toBe(role);
    }
  });
});
