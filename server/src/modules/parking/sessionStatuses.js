// A parking session moves through three states (UC-08, UC-10):
//   active            the vehicle is parked
//   awaiting_payment  exit is recorded and the fee is fixed, but nobody has paid yet
//                     (for example UPI failed and the driver went to fetch cash)
//   completed         paid; the slot is released and the record is final (DR-10)
const SESSION_STATUS = Object.freeze({
  ACTIVE: 'active',
  AWAITING_PAYMENT: 'awaiting_payment',
  COMPLETED: 'completed',
});

// The vehicle is still on site in both of these, so its slot stays occupied and it
// cannot enter again until the session is completed. SQL list for `status IN (...)`.
const ON_SITE_SQL = `('${SESSION_STATUS.ACTIVE}', '${SESSION_STATUS.AWAITING_PAYMENT}')`;

module.exports = { SESSION_STATUS, ON_SITE_SQL };
