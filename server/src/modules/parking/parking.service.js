
const db = require('../../db');
const { HttpError } = require('../../errors');
const parking = require('./parking.repository');

async function assignSlot(vehicleId, userId) {
  const vehicle = await parking.findVehicleById(vehicleId, userId);

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

module.exports = { assignSlot };
