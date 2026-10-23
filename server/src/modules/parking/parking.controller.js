
const service = require('./parking.service');

async function assignSlot(req, res) {
  const { vehicleId } = req.body;

  if (
    !Number.isInteger(vehicleId) ||
    vehicleId <= 0
  ) {
    return res.status(400).json({
      message: 'vehicleId must be a positive integer',
    });
  }

  const session = await service.assignSlot(vehicleId, req.user);

  res.status(201).json({
    session,
    message: `Vehicle assigned to parking slot ${session.slotCode}.`,
  });
}

module.exports = { assignSlot };
