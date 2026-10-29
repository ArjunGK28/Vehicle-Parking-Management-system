// Loaded first by playwright.config.js, the global setup and the support files, so that
// everything (this process, the test workers and the server) uses the test database.
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'parking_test';
process.env.E2E_PORT = process.env.E2E_PORT || '4100';