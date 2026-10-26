
const { Router } = require('express');
const authenticate = require('../../middleware/authenticate');
const { allowRoles } = require('../../middleware/requireRole');
const { ROLES } = require('../users/roles');
const controller = require('./parking.controller');

const router = Router();

router.use(authenticate);

// Drivers and attendants can request an automatic slot assignment.
router.post(
  '/assign',
  allowRoles(ROLES.DRIVER, ROLES.ATTENDANT),
  controller.assignSlot,
);

// Attendants record entry at the gate by registration number (FR-05, #84).
router.post(
  '/entry',
  allowRoles(ROLES.ATTENDANT),
  controller.enter,
);

// Attendants and administrators can find where a vehicle is parked (FR-07, NFR-11).
router.get(
  '/locate',
  allowRoles(ROLES.ATTENDANT, ROLES.ADMIN),
  controller.locate,
);

module.exports = router;