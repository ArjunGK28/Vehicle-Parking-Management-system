const db = require('../../db');
const { HttpError } = require('../../errors');
const { ROLES } = require('../users/roles');
const payments = require('./payments.repository');
const { METHODS } = require('./payments.validation');
const { SESSION_STATUS } = require('../parking/sessionStatuses');

// We have no real payment provider, so this stands in for one (documented in the PR):
// UPI and cash always succeed; a card number ending in 0002 is declined.
const DECLINED_CARD_ENDING = '0002';

function gatewayAccepts({ method, cardNumber }) {
  return !(method === 'card' && cardNumber.endsWith(DECLINED_CARD_ENDING));
}

// FR-10: drivers do not see cash, which only the attendant can take.
function listMethods(user) {
  const isStaff = user.role !== ROLES.DRIVER;
  return METHODS.filter((m) => isStaff || !m.staffOnly);
}

// FR-10 / UC-10: pay for a session whose exit is recorded. Success completes the session
// and releases the slot (UC-08); a failed attempt leaves it waiting, so the driver can
// try again or come back and pay another way. The amount always comes from the session,
// never from the request. A driver pays only for their own vehicles; an attendant or
// administrator can take payment for any session (e.g. cash at the gate).
async function pay(user, { sessionId, method, cardNumber }) {
  const isDriver = user.role === ROLES.DRIVER;

  if (isDriver && method === 'cash') {
    throw new HttpError(400, 'Please correct the highlighted fields', {
      method: 'Cash is paid to the attendant at the exit',
    });
  }

  const connection = await db.getConnection();
  let declined = false;
  let result;

  try {
    await connection.beginTransaction();

    const session = await payments.lockSession(connection, sessionId);
    // Another driver's session gets the same answer as a missing one, so ids reveal nothing.
    if (!session || (isDriver && session.ownerId !== user.id)) {
      throw new HttpError(404, 'Parking session not found');
    }
    if (session.status === SESSION_STATUS.ACTIVE) {
      throw new HttpError(409, 'This vehicle is still parked. Record its exit before payment.');
    }
    if (session.status === SESSION_STATUS.COMPLETED) {
      throw new HttpError(409, 'This session has already been paid');
    }

    declined = !gatewayAccepts({ method, cardNumber });
    const paymentId = await payments.createPayment(connection, {
      sessionId: session.id,
      amount: session.fee,
      method,
      status: declined ? 'failed' : 'paid',
      cardLast4: cardNumber ? cardNumber.slice(-4) : null,
      recordedBy: user.id,
    });
    if (!declined) await payments.completePaidSession(connection, session.id);

    const payment = await payments.findPayment(connection, paymentId);
    await connection.commit();

    const { ownerId, ...publicSession } = session;
    result = {
      payment,
      session: declined
        ? publicSession
        : { ...publicSession, paymentStatus: 'paid', status: SESSION_STATUS.COMPLETED },
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  // The failed attempt is already saved; now tell the user (IT-10_03).
  if (declined) throw new HttpError(402, 'Payment was declined. Try another card or method.');
  return result;
}

async function unpaidSessions(user) {
  return payments.findUnpaidForUser(user.id);
}

async function awaitingPayment() {
  return payments.findAwaitingPayment();
}

module.exports = { listMethods, pay, unpaidSessions, awaitingPayment };