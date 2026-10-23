const { Router } = require('express');
const { allowRoles } = require('../../middleware/requireRole');
const { ROLES } = require('../users/roles');
const controller = require('./rates.controller');

// Mounted at /api/rates. Setting rates is an administrator task (UC-12).
const router = Router();

router.get('/', allowRoles(ROLES.ADMIN), controller.list);
router.put('/:type', allowRoles(ROLES.ADMIN), controller.update);

module.exports = router;
