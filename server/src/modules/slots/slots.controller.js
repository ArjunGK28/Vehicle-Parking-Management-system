const service = require('./slots.service');
const audit = require('../audit/audit.service');
const { AUDIT_ACTIONS } = require('../audit/auditActions');
const {
  validateNewSlot,
  validateSlotUpdate,
  validateSlotFilter,
  parseSlotId,
} = require('./slots.validation');

// FR-03: { slots, counts }. Never cached, so every refresh shows the latest status.
async function list(req, res) {
  const filters = validateSlotFilter(req.query);
  res.set('Cache-Control', 'no-store');
  res.json(await service.listWithCounts(filters));
}

async function create(req, res) {
  const slot = await service.create(validateNewSlot(req.body));
  await audit.record(req.user, AUDIT_ACTIONS.SLOT_ADDED, `Added slot ${slot.code} (${slot.type.replace('_', '-')})`);
  res.status(201).json({ slot, message: `Slot ${slot.code} added.` });
}

async function update(req, res) {
  const id = parseSlotId(req.params.id);
  const { disabled } = validateSlotUpdate(req.body);
  const slot = await service.setDisabled(id, disabled);
  await audit.record(
    req.user,
    disabled ? AUDIT_ACTIONS.SLOT_DISABLED : AUDIT_ACTIONS.SLOT_ENABLED,
    `${disabled ? 'Disabled' : 'Enabled'} slot ${slot.code}`,
  );
  res.json({ slot, message: `Slot ${slot.code} is now ${disabled ? 'unavailable' : 'available'}.` });
}

module.exports = { list, create, update };
