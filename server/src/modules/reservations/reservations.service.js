
const { HttpError } = require('../../errors');
const reservations = require('./reservations.repository');
const vehicles = require('../users/vehicles/vehicles.repository');
const slots = require('../slots/slots.repository');

async function list(userId) {
  return reservations.findByUser(userId);
}

async function create(userId, body) {
  const { vehicleId, slotId, startTime, endTime } = body;

  // Check that the vehicle belongs to this driver.
  const vehicle = await vehicles.findByIdAndUserId(
    vehicleId,
    userId
  );

  if (!vehicle) {
    throw new HttpError(404, 'Vehicle not found');
  }

  // Check that the slot exists and is enabled.
  const slot = await slots.findById(slotId);

  if (!slot) {
    throw new HttpError(404, 'Parking slot not found');
  }

 if (slot.status !== 'available') {
  throw new HttpError(409, 'Parking slot is unavailable');
}

  const start = new Date(startTime);
  const end = new Date(endTime);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end <= start
  ) {
    throw new HttpError(
      400,
      'End time must be after start time'
    );
  }

  // Reject overlapping reservations for this slot.
  const conflict = await reservations.findConflictingReservation(
    slotId,
    startTime,
    endTime
  );

  if (conflict) {
    throw new HttpError(
      409,
      'Parking slot is already reserved for this period'
    );
  }

  return reservations.create({
    userId,
    vehicleId,
    slotId,
    startTime,
    endTime
  });
}

module.exports = {
  list,
  create
};
