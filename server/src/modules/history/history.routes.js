const { Router } = require('express');
const { allowRoles } = require('../../middleware/requireRole');
const { ROLES } = require('../users/roles');
const controller = require('./history.controller');

// Mounted at /api/history (FR-11, UC-11). Read-only: there is no route that changes a
// session, so past sessions cannot be edited (DR-10).
const router = Router();

router.get('/', allowRoles(ROLES.DRIVER), controller.mine);
router.get('/users/:id', allowRoles(ROLES.ADMIN), controller.ofUser);

module.exports = router;