const service = require('./admin.service');
const { validateUserFilter, validateNewUser, parseId } = require('./admin.validation');

const userId = (req) => parseId(req.params.id, 'User not found');
const vehicleId = (req) => parseId(req.params.id, 'Vehicle not found');

async function listUsers(req, res) {
  res.json({ users: await service.listUsers(validateUserFilter(req.query)) });
}

async function createUser(req, res) {
  const user = await service.createUser(validateNewUser(req.body));
  res.status(201).json({ user, message: `Account created for ${user.email}.` });
}

async function removeUser(req, res) {
  await service.removeUser(userId(req), req.user.id);
  res.status(204).end();
}

async function listUserVehicles(req, res) {
  res.json(await service.listUserVehicles(userId(req)));
}

async function updateVehicle(req, res) {
  const vehicle = await service.updateVehicle(vehicleId(req), req.body);
  res.json({ vehicle, message: 'Vehicle updated.' });
}

async function removeVehicle(req, res) {
  await service.removeVehicle(vehicleId(req));
  res.status(204).end();
}

module.exports = { listUsers, createUser, removeUser, listUserVehicles, updateVehicle, removeVehicle };
