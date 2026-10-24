// The four statuses a slot can show (FR-03). Worked out in slots.repository.js.
const SLOT_STATUSES = Object.freeze({
  AVAILABLE: 'available',
  OCCUPIED: 'occupied',
  RESERVED: 'reserved',
  UNAVAILABLE: 'unavailable',
});

const ALL_SLOT_STATUSES = Object.freeze(Object.values(SLOT_STATUSES));

module.exports = { SLOT_STATUSES, ALL_SLOT_STATUSES };