
const { Router } = require('express');
const authenticate = require('../../middleware/authenticate');
const controller = require('./vehicles.controller');

const router = Router();

// All vehicle routes require an authenticated user.
router.use(authenticate);

router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
