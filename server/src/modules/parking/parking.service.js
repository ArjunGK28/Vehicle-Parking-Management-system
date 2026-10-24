
const db = require('../../db');
const { HttpError } = require('../../errors');
const parking = require('./parking.repository');
const slots = require('../slots/slots.repository');

async function assignSlot(vehicleId, user) {
  const isAttendant = user.role === 'attendant';

  const vehicle = await parking.findVehicleById(
    vehicleId,
    isAttendant ? null : user.id,
  );

  if (!vehicle) {
    throw new HttpError(404, 'Vehicle not found');
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Lock the vehicle row so concurrent requests cannot assign it twice.
    await connection.query(
      'SELECT id FROM vehicles WHERE id = ? FOR UPDATE',
      [vehicleId],
    );

    const activeSession = await parking.findActiveSessionForVehicle(
      connection,
      vehicleId,
    );

    if (activeSession) {
      throw new HttpError(409, 'This vehicle already has an active parking session');
    }

    const slot = await parking.findAvailableSlot(connection, vehicle.type);

    if (!slot) {
      throw new HttpError(409, 'No suitable parking slot is currently available');
    }

    const sessionId = await parking.createParkingSession(
      connection,
      vehicleId,
      slot.id,
    );

    await connection.commit();

    return {
      sessionId,
      vehicleId: vehicle.id,
      registrationNumber: vehicle.registration_number,
      slotId: slot.id,
      slotCode: slot.code,
      slotType: slot.type,
      status: 'active',
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// FR-07 / UC-07: where is this vehicle parked right now?
// A vehicle that is not registered and one that is not parked get the same answer,
// so the lookup does not reveal which registration numbers exist.
async function locate({ registrationNumber }) {
  const found = await parking.findActiveSessionByRegistration(registrationNumber);
  if (!found) {
    throw new HttpError(404, 'No active parking session found for this vehicle');
  }

  // The slot's status comes from the same rules as the availability list (FR-03).
  const slot = await slots.findById(found.slotId);

  return {
    vehicle: {
      id: found.vehicleId,
      registrationNumber: found.registrationNumber,
      type: found.vehicleType,
      model: found.model,
      colour: found.colour,
    },
    session: { id: found.sessionId, status: 'active', entryTime: found.entryTime },
    slot: { id: slot.id, code: slot.code, type: slot.type, status: slot.status },
  };
}

module.exports = { assignSlot, locate };