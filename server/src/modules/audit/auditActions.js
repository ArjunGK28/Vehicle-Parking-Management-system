// The administrator actions that are audited (NFR-16). Values match audit_log.action.
const AUDIT_ACTIONS = Object.freeze({
  SLOT_ADDED: 'slot_added',
  SLOT_DISABLED: 'slot_disabled',
  SLOT_ENABLED: 'slot_enabled',
  RATE_CHANGED: 'rate_changed',
  USER_ADDED: 'user_added',
  USER_REMOVED: 'user_removed',
  VEHICLE_UPDATED: 'vehicle_updated',
  VEHICLE_REMOVED: 'vehicle_removed',
});

const ALL_AUDIT_ACTIONS = Object.freeze(Object.values(AUDIT_ACTIONS));

module.exports = { AUDIT_ACTIONS, ALL_AUDIT_ACTIONS };
