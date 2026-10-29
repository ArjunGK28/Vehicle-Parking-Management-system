const service = require('./payments.service');
const { validatePayment } = require('./payments.validation');

async function methods(req, res) {
  res.json({ methods: service.listMethods(req.user) });
}

// FR-10: 201 on success; 402 when the card is declined (the failed attempt is recorded).
async function pay(req, res) {
  const input = validatePayment(req.body || {});
  const { payment, session } = await service.pay(req.user, input);

  res.status(201).json({
    payment,
    session,
    message: `Payment of ₹${payment.amount} received for ${session.registrationNumber}.`,
  });
}

// Never cached, so a session that was just paid disappears straight away.
async function unpaid(req, res) {
  const sessions = await service.unpaidSessions(req.user);
  res.set('Cache-Control', 'no-store');
  res.json({ sessions });
}

// UC-08: staff see every vehicle still waiting to pay. Never cached, for the same reason.
async function awaiting(req, res) {
  const sessions = await service.awaitingPayment();
  res.set('Cache-Control', 'no-store');
  res.json({ sessions });
}

module.exports = { methods, pay, unpaid, awaiting };