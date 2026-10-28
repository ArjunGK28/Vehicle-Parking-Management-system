const db = require('../../db');
const { HttpError } = require('../../errors');
const parking = require('./parking.repository');
const slots = require('../slots/slots.repository');
const rates = require('../rates/rates.service');

async function assignSlot(vehicleId, user) {
  const isAttendant = user.role === 'attendant';

  const vehicle = await parking.findVehicleById(
    vehicleId,
    isAttendant ? null : user.id,
  );

  if (!vehicle) {
    throw new HttpError(404, 'Vehicle not found');
  }

  return startSession(vehicle);
}

// FR-05 / UC-05: the attendant types the registration number at the gate (#84).
// registrationNumber arrives normalised by cleanRegistration.
async function enterVehicle(registrationNumber) {
  const vehicle = await parking.findVehicleByRegistration(registrationNumber);

  if (!vehicle) {
    throw new HttpError(404, 'Vehicle not found');
  }

  return startSession(vehicle);
}

// Starts an active session in a free slot of the vehicle's type (FR-06), shared by
// assignSlot and enterVehicle so both follow the same rules (DR-02, DR-07, DR-08).
async function startSession(vehicle) {
  const vehicleId = vehicle.id;
  const connection = await db.getConnection();

  try {
    // NFR-04: READ COMMITTED makes every check below see sessions other requests have
    // just committed. With the default REPEATABLE READ the first plain SELECT fixes a
    // snapshot, and two simultaneous requests could both be given the same free slot.
    // This setting applies to the next transaction on this connection only.
    await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
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
    const entryTime = await parking.findSessionEntryTime(connection, sessionId);

    await connection.commit();

    return {
      sessionId,
      vehicleId: vehicle.id,
      registrationNumber: vehicle.registration_number,
      slotId: slot.id,
      slotCode: slot.code,
      slotType: slot.type,
      entryTime,
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

// FR-08 / UC-08: the attendant records exit (#66). The fee is calculated before the
// session is completed (FR-09, #68). The slot is free again straight away, because
// availability only counts active sessions (SYS-12).
// No route edits a session, and a completed session is no longer active, so a second
// exit gets the DR-04 404 below; that is how DR-10 is kept.
async function exitVehicle({ registrationNumber, exitTime }) {
  const connection = await db.getConnection();

  try {
    // Like startSession: READ COMMITTED lets the read below see a session that another
    // exit completed while this one waited for the vehicle lock.
    await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await connection.beginTransaction();

    const vehicleId = await parking.lockVehicleByRegistration(connection, registrationNumber);
    const session = vehicleId
      ? await parking.findActiveSessionForExit(connection, vehicleId)
      : null;
    if (!session) {
      throw new HttpError(404, 'No active parking session found for this vehicle');
    }

    const times = await parking.findExitTimes(connection, session.id, exitTime);

    // DR-09
    if (times.durationSeconds < 0) {
      throw new HttpError(400, 'Please correct the highlighted fields', {
        exitTime: 'Exit time cannot be before the entry time',
      });
    }
    if (times.isFuture) {
      throw new HttpError(400, 'Please correct the highlighted fields', {
        exitTime: 'Exit time cannot be in the future',
      });
    }

    const fee = await rates.feeFor(session.slotType, times.durationSeconds, connection);

    await parking.completeSession(connection, session.id, {
      exitTime: times.exitTime,
      feeAmount: fee.amount,
      billedMinutes: fee.billedMinutes,
    });

    await connection.commit();

    return {
      id: session.id,
      vehicleId: session.vehicleId,
      registrationNumber: session.registrationNumber,
      slotId: session.slotId,
      slotCode: session.slotCode,
      slotType: session.slotType,
      entryTime: session.entryTime,
      exitTime: times.exitTime,
      billedMinutes: fee.billedMinutes,
      fee: fee.amount,
      paymentStatus: 'unpaid',
      status: 'completed',
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = { assignSlot, enterVehicle, exitVehicle, locate };