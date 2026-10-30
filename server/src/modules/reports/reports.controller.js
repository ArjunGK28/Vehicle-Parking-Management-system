const service = require('./reports.service');
const { validateRange } = require('./reports.validation');

// FR-12: never cached, so "current" is always the facility as it is now.
async function occupancy(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(await service.occupancy(validateRange(req.query)));
}

module.exports = { occupancy };
