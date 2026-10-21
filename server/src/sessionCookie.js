const config = require('./config');

const SESSION_COOKIE = 'sid';

// httpOnly keeps the token away from page scripts; sameSite blocks cross-site requests.
// No maxAge: the cookie ends with the browser session.
const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: config.isProduction,
  path: '/',
};

module.exports = { SESSION_COOKIE, cookieOptions };
