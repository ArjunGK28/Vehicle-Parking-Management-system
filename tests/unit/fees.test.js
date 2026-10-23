const { calculateFee } = require('../../server/src/modules/rates/fees');

const HOUR = 3600;
const rate = (hourlyRate, overrides = {}) => ({ hourlyRate, minimumFee: 0, billingStepMinutes: 15, ...overrides });

describe('calculateFee (FR-09)', () => {
  test('UT_17: 10:00 to 12:00 at ₹20/hr costs ₹40', () => {
    expect(calculateFee(2 * HOUR, rate(20))).toEqual({ billedMinutes: 120, amount: 40 });
  });

  test('UT_18: 10:00 to 10:45 at ₹20/hr bills 45 minutes with a 15-minute step', () => {
    expect(calculateFee(45 * 60, rate(20))).toEqual({ billedMinutes: 45, amount: 15 });
  });

  test('UT_18: the same stay bills a full hour with a 60-minute step', () => {
    expect(calculateFee(45 * 60, rate(20, { billingStepMinutes: 60 }))).toEqual({ billedMinutes: 60, amount: 20 });
  });

  test('a stay one second into the next step is billed for that step', () => {
    expect(calculateFee(45 * 60 + 1, rate(20)).billedMinutes).toBe(60);
  });

  test('IT_24 data: 1.5 hours at ₹30/hr costs ₹45', () => {
    expect(calculateFee(1.5 * HOUR, rate(30)).amount).toBe(45);
  });

  test('IT_25 data: a zero-length stay is charged the minimum fee', () => {
    expect(calculateFee(0, rate(20, { minimumFee: 10 }))).toEqual({ billedMinutes: 0, amount: 10 });
  });

  test('the minimum fee applies when the time-based fee is lower', () => {
    expect(calculateFee(15 * 60, rate(20, { minimumFee: 10 })).amount).toBe(10);
    expect(calculateFee(60 * 60, rate(20, { minimumFee: 10 })).amount).toBe(20);
  });

  test('a fee that is not whole rupees is rounded up', () => {
    // 45 minutes at ₹25/hr = ₹18.75
    expect(calculateFee(45 * 60, rate(25)).amount).toBe(19);
  });

  test.each([-1, NaN, Infinity, undefined])('refuses a duration of %p', (seconds) => {
    expect(() => calculateFee(seconds, rate(20))).toThrow('calculateFee needs a duration');
  });
});
