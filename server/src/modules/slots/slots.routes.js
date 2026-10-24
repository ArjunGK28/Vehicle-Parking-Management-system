const { Router } = require('express');
const { allowRoles } = require('../../middleware/requireRole');
const { ROLES } = require('../users/roles');
const controller = require('./slots.controller');

// Mounted at /api/slots.
// Any logged-in user may view availability (FR-03); managing slots is an administrator task (UC-12).
const router = Router();

router.get('/', allowRoles(ROLES.DRIVER, ROLES.ATTENDANT, ROLES.ADMIN), controller.list);
router.post('/', allowRoles(ROLES.ADMIN), controller.create);
router.patch('/:id', allowRoles(ROLES.ADMIN), controller.update);

module.exports = router;