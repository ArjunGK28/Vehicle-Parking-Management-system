const { HttpError } = require('../../errors');
const rates = require('./rates.repository');
const { calculateFee } = require('./fees');

async function list() {
  return rates.findAll();
}

// UC-12: the administrator sets the rate for one vehicle type.
async function update(type, rate, adminId) {
  await rates.save(type, rate, adminId);
  return rates.findByType(type);
}

async function getRate(type, executor) {
  const rate = await rates.findByType(type, executor);
  if (!rate) throw new HttpError(503, 'No parking rate is set for this vehicle type');
  return rate;
}

// FR-09: the fee for a stay, using the rate as it is right now, so an updated rate
// applies to every fee calculated after the change (IT_34). Vehicle exit (#66) calls this,
// inside its transaction, and passes that transaction's connection as executor.
async function feeFor(type, durationSeconds, executor) {
  const rate = await getRate(type, executor);
  return { ...calculateFee(durationSeconds, rate), rate };
}

module.exports = { list, update, getRate, feeFor };