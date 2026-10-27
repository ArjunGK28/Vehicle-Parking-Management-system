# Vehicle Parking Management and Tracking System

A web application for registering vehicles, reserving and assigning parking slots, recording
entry and exit, calculating fees and taking payments. Built as a layered client-server app,
as described in the Software Architecture Document.

| Part | Technology | Folder |
|---|---|---|
| Web client | React (Vite) | `client/` |
| REST API | Node.js, Express | `server/` |
| Database | MySQL 8 | `database/` |
| Tests | Jest, Supertest | `tests/` |
| CI | GitHub Actions | `.github/workflows/` |

## Prerequisites

- Node.js 22 or newer (LTS)
- MySQL Server 8 running on `localhost:3306`

## First-time setup

1. Install dependencies (from the repository root):

   ```
   npm install
   ```

2. Create the dev and test databases and the app's MySQL user. You will be asked for your
   MySQL root password:

   ```
   mysql -u root -p < database/setup-dev.sql
   ```

   If `mysql` is not on your PATH, use the full path, for example
   `"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"`.

3. Create the server's config file:

   ```
   cp server/.env.example server/.env
   ```

4. Create the tables:

   ```
   npm run db:init
   ```

5. Create the demo staff accounts (registration only creates drivers):

   ```
   npm run db:seed
   ```

   This adds an administrator and a parking attendant using the `SEED_*` emails and
   passwords in `server/.env`, plus 30 demo parking slots: P-01 to P-20 for four-wheelers
   and P-21 to P-30 for two-wheelers. Running it again leaves existing accounts and slots alone.

## Roles

| Role | How to get one | Home page |
|---|---|---|
| Driver | Register on the sign-up page | `/driver` |
| Parking Attendant | `npm run db:seed` (later: created by an admin) | `/attendant` |
| Administrator | `npm run db:seed` | `/admin` |

Protect an API route by role with `allowRoles` from `server/src/middleware/requireRole.js`:

```js
router.post('/slots', allowRoles(ROLES.ADMIN), controller.create);
```

It returns 401 when nobody is logged in and 403 when the role is not allowed. On the client,
wrap the page in `<RequireAuth roles={[ROLES.ADMIN]}>`.

## Running the app

Start the API and the web client in two terminals:

```
npm run dev:server
npm run dev:client
```

Open http://localhost:5173. The client forwards `/api` requests to the server on port 4000.

To run it as one server instead, build the client first (`npm run build`), then
`npm start -w server` and open http://localhost:4000.

## Tests

```
npm test
```

Tests run against the separate `parking_test` database, which is rebuilt from
`database/schema.sql` at the start of every run. Test names carry the Test Plan IDs
(UT_xx, IT_xx, ST_xx).

## Database changes

Add new tables to `database/schema.sql`. To rebuild your local dev database from scratch
(this deletes its data):

```
npm run db:reset
```
Changing an existing table needs a migration file in `database/migrations/`. Run each one
once on an existing dev database (a fresh `db:reset` already includes them):

- `001-login-lockout.sql`: login lockout columns on `users`
- `002-session-fees.sql`: fee and payment status columns on `parking_sessions` (#66, #68)

```
Get-Content database\migrations\002-session-fees.sql | mysql -u parking_app -p parking_dev
```

## Project layout

```
client/src/
  pages/              screens: auth/, driver/, attendant/, admin/
  auth/               login state and route guards
server/src/
  middleware/         security layer: authenticate, requireRole, error handling
  modules/<module>/   controller, service, repository per business module
database/             schema.sql and the one-time setup script
tests/                unit/ and integration/ tests
```

## Workflow

Each story is built on its own branch and merged through a pull request whose description
contains `Closes #<issue number>`.
