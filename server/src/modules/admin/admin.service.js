const { HttpError } = require('../../errors');
const admin = require('./admin.repository');
const users = require('../users/users.repository');
const vehicles = require('../vehicles/vehicles.repository');
const { hashPassword } = require('../users/password');
const { validateVehicle } = require('../vehicles/vehicles.validation');

// UC-12: the administrator manages users and vehicles (FR-12, #28).

async function listUsers(filter) {
  return admin.findUsers(filter);
}

async function createUser({ name, email, password, role }) {
  const passwordHash = await hashPassword(password);
  let id;
  try {
    id = await users.create({ name, email, passwordHash, role });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'An account with this email already exists', { email: 'Email is already in use' });
    }
    throw err;
  }
  return users.findById(id);
}

async function removeUser(id, adminId) {
  if (id === adminId) throw new HttpError(409, 'You cannot remove your own account');

  const user = await users.findById(id);
  if (!user) throw new HttpError(404, 'User not found');

  if ((await admin.countSessionsForUser(id)) > 0) {
    throw new HttpError(409, 'This user has parking history and cannot be removed');
  }

  try {
    await admin.deleteUser(id);
  } catch (err) {
    // Something else still points at the user, such as payments they recorded.
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      throw new HttpError(409, 'This user has records that must be kept and cannot be removed');
    }
    throw err;
  }
  return user;
}

async function listUserVehicles(userId) {
  const user = await users.findById(userId);
  if (!user) throw new HttpError(404, 'User not found');
  return { user, vehicles: await vehicles.findByUserId(userId) };
}

async function ownerOf(vehicleId) {
  const ownerId = await admin.findVehicleOwner(vehicleId);
  if (!ownerId) throw new HttpError(404, 'Vehicle not found');
  return ownerId;
}

async function updateVehicle(id, body) {
  const details = validateVehicle(body);
  const ownerId = await ownerOf(id);
  try {
    return await vehicles.update(id, ownerId, details);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'This vehicle already exists', {
        registrationNumber: 'Registration number is already in use',
      });
    }
    throw err;
  }
}

async function removeVehicle(id) {
  const ownerId = await ownerOf(id);
  if ((await admin.countSessionsForVehicle(id)) > 0) {
    throw new HttpError(409, 'This vehicle has parking history and cannot be removed');
  }
  const vehicle = await vehicles.findByIdAndUserId(id, ownerId);
  await vehicles.remove(id, ownerId);
  return vehicle;
}

module.exports = { listUsers, createUser, removeUser, listUserVehicles, updateVehicle, removeVehicle };
