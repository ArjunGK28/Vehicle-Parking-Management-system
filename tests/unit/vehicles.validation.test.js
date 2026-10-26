const {
  validateVehicle,
  normaliseRegistration,
  parseVehicleId,
} = require('../../server/src/modules/vehicles/vehicles.validation');

const valid = { registrationNumber: 'KA01AB1234', type: 'four_wheeler', model: 'Swift', colour: 'Red' };

function fieldErrors(fn) {
  try {
    fn();
  } catch (err) {
    expect(err.status).toBe(400);
    return err.fields;
  }
  throw new Error('expected a validation error');
}

describe('normaliseRegistration', () => {
  test.each([
    ['ka 01 ab-1234', 'KA01AB1234'],
    ['  KA-01-AB-1234 ', 'KA01AB1234'],
    ['KA01AB1234', 'KA01AB1234'],
  ])('%p becomes %p', (input, expected) => {
    expect(normaliseRegistration(input)).toBe(expected);
  });

  test('non-text values become an empty string', () => {
    expect(normaliseRegistration(undefined)).toBe('');
    expect(normaliseRegistration(['KA01AB1234'])).toBe('');
  });
});

describe('validateVehicle (FR-02)', () => {
  test('UT-02_01 data: accepts the Test Plan vehicle and trims the text fields', () => {
    expect(validateVehicle({ ...valid, registrationNumber: 'ka 01 ab-1234', model: ' Swift ' })).toEqual(valid);
  });

  test('accepts both vehicle types', () => {
    expect(validateVehicle({ ...valid, type: 'two_wheeler' }).type).toBe('two_wheeler');
  });

  test('IT-02_04 data: rejects 1234, which has no letters', () => {
    expect(fieldErrors(() => validateVehicle({ ...valid, registrationNumber: '1234' }))).toEqual({
      registrationNumber: 'Enter a valid registration number',
    });
  });

  test.each(['KAAB', 'KA1', 'KA01_AB12', 'KA01<b>', 'K'.repeat(10) + '123456'])('rejects the registration number %p', (registrationNumber) => {
    expect(fieldErrors(() => validateVehicle({ ...valid, registrationNumber }))).toEqual({
      registrationNumber: 'Enter a valid registration number',
    });
  });

  test('rejects a type that is not a slot type, such as "Car"', () => {
    expect(fieldErrors(() => validateVehicle({ ...valid, type: 'Car' }))).toEqual({
      type: 'Choose two-wheeler or four-wheeler',
    });
  });

  test('reports every missing field at once', () => {
    expect(Object.keys(fieldErrors(() => validateVehicle({}))).sort()).toEqual([
      'colour',
      'model',
      'registrationNumber',
      'type',
    ]);
  });
});

describe('parseVehicleId', () => {
  test('reads a positive whole number', () => {
    expect(parseVehicleId('7')).toBe(7);
  });

  test.each(['0', '-1', '1abc', '1.5', ''])('treats %p as a missing vehicle', (id) => {
    expect(() => parseVehicleId(id)).toThrow(expect.objectContaining({ status: 404 }));
  });
});
