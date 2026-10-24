const service = require('./slots.service');
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
  res.status(201).json({ slot, message: `Slot ${slot.code} added.` });
}

async function update(req, res) {
  const id = parseSlotId(req.params.id);
  const { disabled } = validateSlotUpdate(req.body);
  const slot = await service.setDisabled(id, disabled);
  res.json({ slot, message: `Slot ${slot.code} is now ${disabled ? 'unavailable' : 'available'}.` });
}

module.exports = { list, create, update };