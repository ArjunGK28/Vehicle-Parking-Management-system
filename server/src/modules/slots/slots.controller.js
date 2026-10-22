const service = require('./slots.service');
const { validateNewSlot, validateSlotUpdate, parseSlotId } = require('./slots.validation');

async function list(req, res) {
  res.json({ slots: await service.list() });
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
