const service = require('./history.service');
const { validatePageQuery } = require('./history.validation');
const { parseId } = require('../admin/admin.validation');

// Never cached, so a session that has just been completed shows up straight away.
async function mine(req, res) {
  const result = await service.ownHistory(req.user, validatePageQuery(req.query));
  res.set('Cache-Control', 'no-store');
  res.json(result);
}

async function ofUser(req, res) {
  const userId = parseId(req.params.id, 'User not found');
  const result = await service.historyOfUser(userId, validatePageQuery(req.query));
  res.set('Cache-Control', 'no-store');
  res.json(result);
}

module.exports = { mine, ofUser };