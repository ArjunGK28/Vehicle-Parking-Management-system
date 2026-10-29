const db = require('../../db');
const { HttpError } = require('../../errors');
const parking = require('./parking.repository');
const slots = require('../slots/slots.repository');
const rates = require('../rates/rates.service');
const { SESSION_STATUS } = require('./sessionStatuses');

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

    const onSite = await parking.findOnSiteSessionForVehicle(
      connection,
      vehicleId,
    );

    if (onSite && onSite.status === SESSION_STATUS.AWAITING_PAYMENT) {
      throw new HttpError(409, 'This vehicle has not paid for its last stay yet. Take payment before it enters again.');
    }
    if (onSite) {
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
      status: SESSION_STATUS.ACTIVE,
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// FR-07 / UC-07: where is this vehicle parked right now? A vehicle waiting to pay is
// still in its slot, so it is found too, with session status awaiting_payment.
// A vehicle that is not registered and one that is not parked get the same answer,
// so the lookup does not reveal which registration numbers exist.
async function locate({ registrationNumber }) {
  const found = await parking.findOnSiteSessionByRegistration(registrationNumber);
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
    session: { id: found.sessionId, status: found.status, entryTime: found.entryTime },
    slot: { id: slot.id, code: slot.code, type: slot.type, status: slot.status },
  };
}

// FR-08 / UC-08: the attendant records exit (#66) and the fee is calculated (FR-09, #68).
// The session then waits for payment: payment completes it and only then is the slot
// released (UC-08 steps 3 and 4, SYS-12). Until then the vehicle is still on site, so
// if UPI fails the driver can come back and pay another way.
// No route edits a session: a second exit is refused with 409 while the session waits
// for payment, and with the DR-04 404 once it is completed; that is how DR-10 is kept.
async function exitVehicle({ registrationNumber, exitTime }) {
  const connection = await db.getConnection();

  try {
    // Like startSession: READ COMMITTED lets the read below see a session that another
    // exit completed while this one waited for the vehicle lock.
    await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await connection.beginTransaction();

    const vehicleId = await parking.lockVehicleByRegistration(connection, registrationNumber);
    const session = vehicleId
      ? await parking.findOnSiteSessionForExit(connection, vehicleId)
      : null;
    if (!session) {
      throw new HttpError(404, 'No active parking session found for this vehicle');
    }
    if (session.status === SESSION_STATUS.AWAITING_PAYMENT) {
      throw new HttpError(
        409,
        `Exit is already recorded for ${session.registrationNumber}. It is waiting for payment of ₹${session.fee}.`,
      );
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

    await parking.recordExit(connection, session.id, {
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
      status: SESSION_STATUS.AWAITING_PAYMENT,
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = { assignSlot, enterVehicle, exitVehicle, locate };