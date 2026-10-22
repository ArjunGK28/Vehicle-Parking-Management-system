
const { Router } = require('express');
const authenticate = require('../../middleware/authenticate');
const controller = require('./reservations.controller');

const router = Router();

router.use(authenticate);

router.get('/', controller.list);
router.post('/', controller.create);

module.exports = router;
