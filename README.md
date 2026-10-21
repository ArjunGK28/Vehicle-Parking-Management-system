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

## Project layout

```
client/src/
  pages/              screens (auth/, and driver/, attendant/, admin/ as they are built)
  auth/               login state and route guards
server/src/
  middleware/         security layer: authenticate, error handling
  modules/<module>/   controller, service, repository per business module
database/             schema.sql and the one-time setup script
tests/                unit/ and integration/ tests
```

## Workflow

Each story is built on its own branch and merged through a pull request whose description
contains `Closes #<issue number>`.
