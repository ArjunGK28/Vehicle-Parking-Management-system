
const { HttpError } = require('../../errors');

const pad = (n) => String(n).padStart(2, '0');

// Local wall time, as a datetime-local input sends it: 2027-01-10T10:00 or 2027-01-10 10:00:00.
const LOCAL_PATTERN = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;
// A moment with a zone, as toISOString() sends it: 2027-01-10T04:30:00.000Z or ...+05:30.
const ZONED_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

// Returns 'YYYY-MM-DD HH:MM:SS' for MySQL, or null. A time with a zone is converted to
// the server's local time, which is what MySQL's NOW() and the stored times use.
// MySQL refuses the raw ISO form, which used to cause a 500 (Sprint 1 demo bug).
function toMysqlDateTime(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();

  const local = LOCAL_PATTERN.exec(text);
  if (local) {
    const [, date, hours, minutes, seconds = '00'] = local;
    const result = `${date} ${hours}:${minutes}:${seconds}`;
    // Rejects impossible dates such as 2027-02-30 or 25:00.
    const check = new Date(`${date}T${hours}:${minutes}:${seconds}`);
    if (Number.isNaN(check.getTime()) || check.getDate() !== Number(date.slice(8, 10)) || check.getHours() !== Number(hours)) {
      return null;
    }
    return result;
  }

  if (ZONED_PATTERN.test(text)) {
    const d = new Date(text);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
      + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  return null;
}

function validateReservation(body) {
  const fields = {};

  const vehicleId = Number(body.vehicleId);
  const slotId = Number(body.slotId);
  const startTime = toMysqlDateTime(body.startTime);
  const endTime = toMysqlDateTime(body.endTime);

  if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
    fields.vehicleId = 'A valid vehicle ID is required';
  }

  if (!Number.isInteger(slotId) || slotId <= 0) {
    fields.slotId = 'A valid parking slot ID is required';
  }

  if (!startTime) {
    fields.startTime = 'A valid start time is required';
  }

  if (!endTime) {
    fields.endTime = 'A valid end time is required';
  }

  // Both are 'YYYY-MM-DD HH:MM:SS' now, so text order is time order.
  if (startTime && endTime && endTime <= startTime) {
    fields.endTime = 'End time must be after start time';
  }

  if (Object.keys(fields).length > 0) {
    throw new HttpError(
      400,
      'Please correct the highlighted fields',
      fields
    );
  }

  return {
    vehicleId,
    slotId,
    startTime,
    endTime
  };
}

module.exports = { validateReservation, toMysqlDateTime };
