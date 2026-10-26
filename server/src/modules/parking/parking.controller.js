
const service = require('./parking.service');
const { validateLocateQuery, cleanRegistration } = require('./parking.validation');

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

// FR-05: the attendant records entry by registration number (#84).
async function enter(req, res) {
  const registrationNumber = cleanRegistration((req.body || {}).registrationNumber);
  const session = await service.enterVehicle(registrationNumber);

  res.status(201).json({
    session,
    message: `Vehicle ${session.registrationNumber} entered. Go to slot ${session.slotCode}.`,
  });
}

// FR-07: never cached, so the answer always shows the vehicle's latest slot.
async function locate(req, res) {
  const query = validateLocateQuery(req.query);
  const result = await service.locate(query);

  res.set('Cache-Control', 'no-store');
  res.json({
    ...result,
    message: `Vehicle ${result.vehicle.registrationNumber} is in slot ${result.slot.code}.`,
  });
}

module.exports = { assignSlot, enter, locate };