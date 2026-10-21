const { HttpError } = require('../../errors');
const users = require('./users.repository');
const { hashPassword } = require('./password');

// UC-01 main flow steps 1-2: validate, then create a driver account.
async function register({ name, email, password }) {
  const passwordHash = await hashPassword(password);
  let id;
  try {
    id = await users.create({ name, email, passwordHash });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'An account with this email already exists', {
        email: 'Email is already in use',
      });
    }
    throw err;
  }
  return users.findById(id);
}

module.exports = { register };
