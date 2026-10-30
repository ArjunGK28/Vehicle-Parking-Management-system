const { Router } = require('express');
const { allowRoles } = require('../../middleware/requireRole');
const { ROLES } = require('../users/roles');
const controller = require('./reports.controller');

// Mounted at /api/reports. Reports are an administrator task (UC-12).
const router = Router();

router.get('/occupancy', allowRoles(ROLES.ADMIN), controller.occupancy);

module.exports = router;
