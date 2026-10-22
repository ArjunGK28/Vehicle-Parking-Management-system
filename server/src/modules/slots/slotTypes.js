// Slot types for DR-07: a vehicle may only be given a slot of its own type.
// Values match the parking_slots.slot_type column.
const SLOT_TYPES = Object.freeze({
  TWO_WHEELER: 'two_wheeler',
  FOUR_WHEELER: 'four_wheeler',
});

const ALL_SLOT_TYPES = Object.freeze(Object.values(SLOT_TYPES));

module.exports = { SLOT_TYPES, ALL_SLOT_TYPES };
