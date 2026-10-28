const { validateReservation, toMysqlDateTime } = require('../../server/src/modules/reservations/reservations.validation');

const pad = (n) => String(n).padStart(2, '0');
const localText = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

function fieldErrors(fn) {
  try {
    fn();
  } catch (err) {
    expect(err.status).toBe(400);
    return err.fields;
  }
  throw new Error('expected a validation error');
}

describe('toMysqlDateTime', () => {
  test.each([
    ['2027-01-10T10:00', '2027-01-10 10:00:00'],
    ['2027-01-10T10:00:30', '2027-01-10 10:00:30'],
    ['2027-01-10 10:00:00', '2027-01-10 10:00:00'],
  ])('keeps the local time %p as %p', (input, expected) => {
    expect(toMysqlDateTime(input)).toBe(expected);
  });

  test('converts an ISO time with Z and milliseconds to server local time (the demo bug)', () => {
    const iso = '2026-10-27T04:30:00.000Z';
    expect(toMysqlDateTime(iso)).toBe(localText(new Date(iso)));
  });

  test('converts a time with an offset', () => {
    const iso = '2027-01-10T10:00:00+05:30';
    expect(toMysqlDateTime(iso)).toBe(localText(new Date(iso)));
  });

  test.each(['1', 'March 5', '2027-02-30T10:00', '2027-01-10T25:00', '2027-01-10', '', undefined, 1700000000000])(
    'refuses %p',
    (input) => {
      expect(toMysqlDateTime(input)).toBeNull();
    },
  );
});

describe('validateReservation', () => {
  const base = { vehicleId: 1, slotId: 2 };

  test('returns MySQL-ready times', () => {
    expect(validateReservation({ ...base, startTime: '2027-01-10T14:00', endTime: '2027-01-10T16:00' })).toEqual({
      ...base,
      startTime: '2027-01-10 14:00:00',
      endTime: '2027-01-10 16:00:00',
    });
  });

  test('IT-04_04 data: an end before the start is refused', () => {
    expect(fieldErrors(() => validateReservation({ ...base, startTime: '2027-01-10T16:00', endTime: '2027-01-10T14:00' }))).toEqual({
      endTime: 'End time must be after start time',
    });
  });

  test('text that is not a date-time is refused instead of reaching MySQL', () => {
    expect(fieldErrors(() => validateReservation({ ...base, startTime: '1', endTime: 'tomorrow' }))).toEqual({
      startTime: 'A valid start time is required',
      endTime: 'A valid end time is required',
    });
  });
});
