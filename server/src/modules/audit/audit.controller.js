const service = require('./audit.service');
const { validateAuditQuery } = require('./audit.validation');

// NFR-16 / NFR-17: the audit trail, newest first. Never cached.
async function list(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(await service.list(validateAuditQuery(req.query)));
}

module.exports = { list };
