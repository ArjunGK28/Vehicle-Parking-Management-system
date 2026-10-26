
const { Router } = require('express');
const { allowRoles } = require('../../middleware/requireRole');
const { ROLES } = require('../users/roles');
const controller = require('./vehicles.controller');

const router = Router();

// Drivers manage their own vehicles (FR-02). Staff look vehicles up through
// parking (locate, entry) and administrators through user management (#28).
router.use(allowRoles(ROLES.DRIVER));

router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
