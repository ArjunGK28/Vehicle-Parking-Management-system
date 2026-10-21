// An error that maps directly to an HTTP response.
// `fields` carries per-field validation messages, e.g. { email: 'Enter a valid email address' }.
class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    if (fields) this.fields = fields;
  }
}

module.exports = { HttpError };
