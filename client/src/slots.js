// Mirrors server/src/modules/slots/slotTypes.js
export const SLOT_TYPE_LABELS = {
  two_wheeler: 'Two-wheeler',
  four_wheeler: 'Four-wheeler',
};

export const SLOT_STATUS_LABELS = {
  available: 'Available',
  occupied: 'Occupied',
  reserved: 'Reserved',
  unavailable: 'Unavailable',
};

// Order used for the summary and the status filter.
export const SLOT_STATUS_ORDER = ['available', 'occupied', 'reserved', 'unavailable'];