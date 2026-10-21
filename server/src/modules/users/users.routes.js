const { Router } = require('express');
const authenticate = require('../../middleware/authenticate');
const controller = require('./users.controller');

// Mounted at /api/auth
const router = Router();

router.post('/register', controller.register);
router.post('/login', controller.login);
router.post('/logout', controller.logout);
router.get('/me', authenticate, controller.me);

module.exports = router;
