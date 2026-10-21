// Mirrors server/src/modules/users/roles.js
export const ROLES = Object.freeze({
  DRIVER: 'driver',
  ATTENDANT: 'attendant',
  ADMIN: 'admin',
});

export const ROLE_LABELS = {
  [ROLES.DRIVER]: 'Driver',
  [ROLES.ATTENDANT]: 'Parking Attendant',
  [ROLES.ADMIN]: 'Administrator',
};

// Where each role lands after logging in.
export const ROLE_HOME = {
  [ROLES.DRIVER]: '/driver',
  [ROLES.ATTENDANT]: '/attendant',
  [ROLES.ADMIN]: '/admin',
};
