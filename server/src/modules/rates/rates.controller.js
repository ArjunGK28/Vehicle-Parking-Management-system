const service = require('./rates.service');
const { validateRate, parseSlotType } = require('./rates.validation');

async function list(req, res) {
  res.json({ rates: await service.list() });
}

async function update(req, res) {
  const type = parseSlotType(req.params.type);
  const rate = await service.update(type, validateRate(req.body), req.user.id);
  res.json({ rate, message: 'Rate saved. New fees will use it.' });
}

module.exports = { list, update };
