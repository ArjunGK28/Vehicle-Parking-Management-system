const { HttpError } = require('../../errors');
const slots = require('./slots.repository');

async function list() {
  return slots.findAll();
}

// UC-12: the admin adds a slot. Codes are unique, so P-30 cannot be added twice.
async function create({ code, type }) {
  try {
    const id = await slots.create({ code, type });
    return slots.findById(id);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, `Slot ${code} already exists`, { code: 'This slot code is already in use' });
    }
    throw err;
  }
}

// UC-12: a disabled slot shows Unavailable and is never assigned (IT_35).
async function setDisabled(id, disabled) {
  if (!(await slots.findById(id))) throw new HttpError(404, 'Slot not found');
  await slots.setDisabled(id, disabled);
  return slots.findById(id);
}

// Slots a vehicle of this type may be given (DR-07), for slot assignment (FR-06).
async function listAssignable(type) {
  return slots.findAssignable(type);
}

module.exports = { list, create, setDisabled, listAssignable };
