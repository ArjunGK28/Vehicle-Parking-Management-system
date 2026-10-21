// The three roles from the SRS (NFR-11). Values match the users.role column.
const ROLES = Object.freeze({
  DRIVER: 'driver',
  ATTENDANT: 'attendant',
  ADMIN: 'admin',
});

const ALL_ROLES = Object.freeze(Object.values(ROLES));

module.exports = { ROLES, ALL_ROLES };
