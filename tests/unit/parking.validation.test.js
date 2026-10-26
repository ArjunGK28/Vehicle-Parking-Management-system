const { validateLocateQuery } = require('../../server/src/modules/parking/parking.validation');

function fieldErrors(fn) {
  try {
    fn();
  } catch (err) {
    expect(err.status).toBe(400);
    return err.fields;
  }
  throw new Error('expected a validation error');
}

describe('validateLocateQuery (FR-07)', () => {
  test('trims and upper-cases the registration number', () => {
    expect(validateLocateQuery({ registrationNumber: '  ka01ab1234 ' })).toEqual({ registrationNumber: 'KA01AB1234' });
  });

  test('removes spaces and hyphens, as vehicles are stored', () => {
    expect(validateLocateQuery({ registrationNumber: 'KA-01 AB-1234' }).registrationNumber).toBe('KA01AB1234');
  });

  test.each([undefined, '', '   '])('asks for a registration number when it is %p', (registrationNumber) => {
    expect(fieldErrors(() => validateLocateQuery({ registrationNumber }))).toEqual({
      registrationNumber: 'Enter a registration number',
    });
  });

  test('asks for a registration number when the query is missing', () => {
    expect(fieldErrors(() => validateLocateQuery())).toEqual({ registrationNumber: 'Enter a registration number' });
  });

  test.each(['KA01<script>', 'KA01_AB', 'KA01;DROP', 'A'.repeat(21)])('rejects %p', (registrationNumber) => {
    expect(fieldErrors(() => validateLocateQuery({ registrationNumber }))).toEqual({
      registrationNumber: 'Enter a valid registration number',
    });
  });

  test('rejects repeated parameters and other non-text values', () => {
    expect(fieldErrors(() => validateLocateQuery({ registrationNumber: ['A1', 'B2'] }))).toEqual({
      registrationNumber: 'Enter a valid registration number',
    });
  });

  test('the top-level error message is the field message', () => {
    try {
      validateLocateQuery({ registrationNumber: '' });
    } catch (err) {
      expect(err.message).toBe('Enter a registration number');
    }
  });
});