// Tests from the Test Plan live in tests/: unit/ needs no database,
// integration/ runs against the parking_test MySQL database.
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/setupEnv.js'],
  globalSetup: '<rootDir>/tests/globalSetup.js',
};
