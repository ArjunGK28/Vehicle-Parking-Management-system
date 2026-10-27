const { Router } = require('express');
const { allowRoles } = require('../../middleware/requireRole');
const { ROLES } = require('../users/roles');
const controller = require('./admin.controller');

// Mounted at /api/admin. Managing users and vehicles is an administrator task (UC-12).
const router = Router();

router.use(allowRoles(ROLES.ADMIN));

router.get('/users', controller.listUsers);
router.post('/users', controller.createUser);
router.delete('/users/:id', controller.removeUser);
router.get('/users/:id/vehicles', controller.listUserVehicles);
router.put('/vehicles/:id', controller.updateVehicle);
router.delete('/vehicles/:id', controller.removeVehicle);

module.exports = router;
