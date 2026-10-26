
const { HttpError } = require('../../errors');
const vehicles = require('./vehicles.repository');
const { validateVehicle } = require('./vehicles.validation');

function handleDatabaseError(err) {
  if (err.code === 'ER_DUP_ENTRY') {
    throw new HttpError(409, 'This vehicle already exists', {
      registrationNumber: 'Registration number is already in use',
    });
  }

  throw err;
}

async function list(userId) {
  return vehicles.findByUserId(userId);
}

async function get(id, userId) {
  const vehicle = await vehicles.findByIdAndUserId(id, userId);

  if (!vehicle) {
    throw new HttpError(404, 'Vehicle not found');
  }

  return vehicle;
}

async function create(userId, body) {
  const vehicleData = validateVehicle(body);

  try {
    return await vehicles.create({ userId, ...vehicleData });
  } catch (err) {
    handleDatabaseError(err);
  }
}

async function update(id, userId, body) {
  const vehicleData = validateVehicle(body);

  try {
    const vehicle = await vehicles.update(id, userId, vehicleData);

    if (!vehicle) {
      throw new HttpError(404, 'Vehicle not found');
    }

    return vehicle;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    handleDatabaseError(err);
  }
}

async function remove(id, userId) {
  const deleted = await vehicles.remove(id, userId);

  if (!deleted) {
    throw new HttpError(404, 'Vehicle not found');
  }

  return true;
}

module.exports = { list, get, create, update, remove };
