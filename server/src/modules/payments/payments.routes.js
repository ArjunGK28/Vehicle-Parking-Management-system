const { Router } = require('express');
const { allowRoles } = require('../../middleware/requireRole');
const { ROLES } = require('../users/roles');
const controller = require('./payments.controller');

// Mounted at /api/payments (FR-10, UC-10).
const router = Router();

// Every logged-in user sees the methods they may use (drivers do not see cash).
router.get('/methods', allowRoles(ROLES.DRIVER, ROLES.ATTENDANT, ROLES.ADMIN), controller.methods);

// A driver pays for their own sessions; staff take payment for any session.
router.post('/', allowRoles(ROLES.DRIVER, ROLES.ATTENDANT, ROLES.ADMIN), controller.pay);

// The logged-in driver's completed sessions that still need paying.
router.get('/unpaid', allowRoles(ROLES.DRIVER), controller.unpaid);

module.exports = router;