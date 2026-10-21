
const service = require('./vehicles.service');

async function list(req, res) {
  const vehicles = await service.list(req.user.id);
  res.json({ vehicles });
}

async function get(req, res) {
  const vehicle = await service.get(
    req.params.id,
    req.user.id
  );
  res.json({ vehicle });
}

async function create(req, res) {
  const vehicle = await service.create(
    req.user.id,
    req.body
  );
  res.status(201).json({
    vehicle,
    message: 'Vehicle registered successfully.'
  });
}

async function update(req, res) {
  const vehicle = await service.update(
    req.params.id,
    req.user.id,
    req.body
  );
  res.json({
    vehicle,
    message: 'Vehicle updated successfully.'
  });
}

async function remove(req, res) {
  await service.remove(req.params.id, req.user.id);
  res.status(204).end();
}

module.exports = { list, get, create, update, remove };
