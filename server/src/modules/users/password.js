const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

// Hash of a random value, compared against when the email is unknown so a failed
// login takes the same time whether or not the account exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', SALT_ROUNDS);

function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash || DUMMY_HASH);
}

module.exports = { hashPassword, verifyPassword };
