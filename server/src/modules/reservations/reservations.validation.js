
const { HttpError } = require('../../errors');

function validateReservation(body) {
  const fields = {};

  const vehicleId = Number(body.vehicleId);
  const slotId = Number(body.slotId);
  const startTime = body.startTime;
  const endTime = body.endTime;

  if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
    fields.vehicleId = 'A valid vehicle ID is required';
  }

  if (!Number.isInteger(slotId) || slotId <= 0) {
    fields.slotId = 'A valid parking slot ID is required';
  }

  if (
    typeof startTime !== 'string' ||
    Number.isNaN(Date.parse(startTime))
  ) {
    fields.startTime = 'A valid start time is required';
  }

  if (
    typeof endTime !== 'string' ||
    Number.isNaN(Date.parse(endTime))
  ) {
    fields.endTime = 'A valid end time is required';
  }

  if (
    typeof startTime === 'string' &&
    typeof endTime === 'string' &&
    !Number.isNaN(Date.parse(startTime)) &&
    !Number.isNaN(Date.parse(endTime)) &&
    Date.parse(endTime) <= Date.parse(startTime)
  ) {
    fields.endTime = 'End time must be after start time';
  }

  if (Object.keys(fields).length > 0) {
    throw new HttpError(
      400,
      'Please correct the highlighted fields',
      fields
    );
  }

  return {
    vehicleId,
    slotId,
    startTime,
    endTime
  };
}

module.exports = { validateReservation };
