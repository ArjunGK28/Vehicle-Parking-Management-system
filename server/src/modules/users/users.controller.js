const service = require('./users.service');
const { validateRegistration, validateLogin } = require('./users.validation');
const { SESSION_COOKIE, cookieOptions, readSessionToken } = require('../../sessionCookie');

async function register(req, res) {
  const user = await service.register(validateRegistration(req.body));
  res.status(201).json({ user, message: 'Account created. You can now log in.' });
}

async function login(req, res) {
  const { user, token } = await service.login(validateLogin(req.body));
  res.cookie(SESSION_COOKIE, token, cookieOptions);
  res.json({ user });
}

async function logout(req, res) {
  await service.logout(readSessionToken(req));
  res.clearCookie(SESSION_COOKIE, cookieOptions);
  res.status(204).end();
}

function me(req, res) {
  res.json({ user: req.user });
}

module.exports = { register, login, logout, me };