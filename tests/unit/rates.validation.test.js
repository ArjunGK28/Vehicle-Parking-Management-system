const { validateRate, parseSlotType } = require('../../server/src/modules/rates/rates.validation');

const valid = { hourlyRate: 25, minimumFee: 10, billingStepMinutes: 15 };

function fieldErrors(fn) {
  try {
    fn();
  } catch (err) {
    expect(err.status).toBe(400);
    return err.fields;
  }
  throw new Error('expected a validation error');
}

describe('validateRate', () => {
  test('accepts the Test Plan rate (IT-12_04 data: ₹25/hr)', () => {
    expect(validateRate(valid)).toEqual(valid);
  });

  test('accepts numbers sent as text, as a form would send them', () => {
    expect(validateRate({ hourlyRate: '25', minimumFee: ' 0 ', billingStepMinutes: '60' })).toEqual({
      hourlyRate: 25,
      minimumFee: 0,
      billingStepMinutes: 60,
    });
  });

  test('reports every missing field at once', () => {
    expect(Object.keys(fieldErrors(() => validateRate({}))).sort()).toEqual([
      'billingStepMinutes',
      'hourlyRate',
      'minimumFee',
    ]);
  });

  test.each([0, -5, 25.5, '2e1', 'abc', 10001, true])('rejects an hourly rate of %p', (hourlyRate) => {
    expect(fieldErrors(() => validateRate({ ...valid, hourlyRate }))).toEqual({
      hourlyRate: 'Hourly rate must be a whole number of rupees from 1 to 10000',
    });
  });

  test('allows a minimum fee of 0 but not a negative one', () => {
    expect(validateRate({ ...valid, minimumFee: 0 }).minimumFee).toBe(0);
    expect(fieldErrors(() => validateRate({ ...valid, minimumFee: -1 }))).toEqual({
      minimumFee: 'Minimum fee must be a whole number of rupees from 0 to 10000',
    });
  });

  test.each([0, 10, 45, '15.0'])('rejects a billing step of %p', (billingStepMinutes) => {
    expect(fieldErrors(() => validateRate({ ...valid, billingStepMinutes }))).toEqual({
      billingStepMinutes: 'Billing step must be 15, 30, 60 minutes',
    });
  });
});

describe('parseSlotType', () => {
  test('accepts both slot types', () => {
    expect(parseSlotType('two_wheeler')).toBe('two_wheeler');
    expect(parseSlotType('four_wheeler')).toBe('four_wheeler');
  });

  test('treats anything else as not found', () => {
    expect(() => parseSlotType('truck')).toThrow(expect.objectContaining({ status: 404 }));
  });
});
