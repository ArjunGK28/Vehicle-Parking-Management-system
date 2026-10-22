
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

module.exports = router;
