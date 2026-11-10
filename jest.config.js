// Tests from the Test Plan live in tests/: unit/ needs no database,
// integration/ runs against the parking_test MySQL database.
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/setupEnv.js'],
  globalSetup: '<rootDir>/tests/globalSetup.js',
  // Many tests create and log in several users in a hook, and bcrypt is slow on some
  // computers, so the default 5 seconds is sometimes too short. Real failures still fail.
  testTimeout: 30000,
  // `npm run test:coverage` measures statement and branch coverage of the server code.
  // The web client is covered by the browser tests in e2e/, not by Jest.
  collectCoverageFrom: ['server/src/**/*.js', '!server/src/index.js'],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'text-summary', 'html', 'json-summary', 'json'],
};