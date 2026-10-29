const { HttpError } = require('../errors');

// Last middleware in the chain: turns thrown errors into JSON responses.
// Unexpected errors are logged and hidden behind a generic 500 message.
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    const body = { error: err.message };
    if (err.fields) body.fields = err.fields;
    return res.status(err.status).json(body);
  }

  // Malformed JSON request body
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }

  // Request body larger than the express.json limit
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large' });
  }

  // NFR-18: log the code and stack only. Printing the whole error would also print the
  // SQL with its values (an email, a password hash) that the database driver attaches to it.
  console.error(`${err && err.code ? `[${err.code}] ` : ''}${(err && err.stack) || err}`);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

module.exports = { errorHandler, notFound };