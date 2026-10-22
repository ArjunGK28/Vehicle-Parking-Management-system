
const { HttpError } = require('../../errors');
const service = require('./reservations.service');
const { validateReservation } = require('./reservations.validation');

async function list(req, res) {
  const reservations = await service.list(req.user.id);
  res.json({ reservations });
}

async function create(req, res) {
  const reservationData = validateReservation(req.body);
  const reservation = await service.create(
    req.user.id,
    reservationData
  );

  res.status(201).json({
    reservation,
    message: 'Reservation created successfully'
  });
}

module.exports = {
  list,
  create
};
