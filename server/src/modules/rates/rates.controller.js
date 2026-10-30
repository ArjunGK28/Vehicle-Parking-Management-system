const service = require('./rates.service');
const audit = require('../audit/audit.service');
const { AUDIT_ACTIONS } = require('../audit/auditActions');
const { validateRate, parseSlotType } = require('./rates.validation');

async function list(req, res) {
  res.json({ rates: await service.list() });
}

async function update(req, res) {
  const type = parseSlotType(req.params.type);
  const rate = await service.update(type, validateRate(req.body), req.user.id);
  await audit.record(
    req.user,
    AUDIT_ACTIONS.RATE_CHANGED,
    `Set the ${type.replace('_', '-')} rate to ₹${rate.hourlyRate}/hr, minimum ₹${rate.minimumFee}, `
      + `billed in ${rate.billingStepMinutes}-minute steps`,
  );
  res.json({ rate, message: 'Rate saved. New fees will use it.' });
}

module.exports = { list, update };
