const service = require('./admin.service');
const audit = require('../audit/audit.service');
const { AUDIT_ACTIONS } = require('../audit/auditActions');
const { validateUserFilter, validateNewUser, parseId } = require('./admin.validation');

const userId = (req) => parseId(req.params.id, 'User not found');
const vehicleId = (req) => parseId(req.params.id, 'Vehicle not found');

async function listUsers(req, res) {
  res.json({ users: await service.listUsers(validateUserFilter(req.query)) });
}

async function createUser(req, res) {
  const user = await service.createUser(validateNewUser(req.body));
  await audit.record(req.user, AUDIT_ACTIONS.USER_ADDED, `Added ${user.role} account ${user.email} (${user.name})`);
  res.status(201).json({ user, message: `Account created for ${user.email}.` });
}

async function removeUser(req, res) {
  const user = await service.removeUser(userId(req), req.user.id);
  await audit.record(req.user, AUDIT_ACTIONS.USER_REMOVED, `Removed ${user.role} account ${user.email} (${user.name})`);
  res.status(204).end();
}

async function listUserVehicles(req, res) {
  res.json(await service.listUserVehicles(userId(req)));
}

async function updateVehicle(req, res) {
  const vehicle = await service.updateVehicle(vehicleId(req), req.body);
  await audit.record(
    req.user,
    AUDIT_ACTIONS.VEHICLE_UPDATED,
    `Updated vehicle ${vehicle.registrationNumber} (${vehicle.type.replace('_', '-')}, ${vehicle.model}, ${vehicle.colour})`,
  );
  res.json({ vehicle, message: 'Vehicle updated.' });
}

async function removeVehicle(req, res) {
  const vehicle = await service.removeVehicle(vehicleId(req));
  await audit.record(req.user, AUDIT_ACTIONS.VEHICLE_REMOVED, `Removed vehicle ${vehicle.registrationNumber}`);
  res.status(204).end();
}

module.exports = { listUsers, createUser, removeUser, listUserVehicles, updateVehicle, removeVehicle };
