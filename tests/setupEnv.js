// Runs before every test file, before any server module is loaded,
// so the server talks to the test database instead of parking_dev.
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'parking_test';
