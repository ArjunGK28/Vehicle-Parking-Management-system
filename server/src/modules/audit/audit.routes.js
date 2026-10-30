const { Router } = require('express');
const { allowRoles } = require('../../middleware/requireRole');
const { ROLES } = require('../users/roles');
const controller = require('./audit.controller');

// Mounted at /api/audit. Only administrators may read the audit trail (NFR-17, IT-12_03).
const router = Router();

router.get('/', allowRoles(ROLES.ADMIN), controller.list);

module.exports = router;
