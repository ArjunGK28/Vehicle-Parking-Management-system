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

// Returns the session token from the request, or null if it is missing or malformed.
// cookie-parser turns values such as j:{"a":1} into objects, so only plain strings are accepted.
function readSessionToken(req) {
  const token = req.cookies && req.cookies[SESSION_COOKIE];
  return typeof token === 'string' && token.length > 0 && token.length <= 200 ? token : null;
}

module.exports = { SESSION_COOKIE, cookieOptions, readSessionToken };