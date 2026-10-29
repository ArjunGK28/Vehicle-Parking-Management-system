const { validatePayment, passesLuhn } = require('../../server/src/modules/payments/payments.validation');

const NOW = new Date(2026, 9, 29); // 29 October 2026
const fieldsOf = (body) => {
  try {
    validatePayment(body, NOW);
    return null;
  } catch (err) {
    return err.fields;
  }
};

describe('payment validation (FR-10)', () => {
  test('UPI and cash need only the session and method', () => {
    expect(validatePayment({ sessionId: 12, method: 'upi' }, NOW)).toEqual({ sessionId: 12, method: 'upi', cardNumber: null });
    expect(validatePayment({ sessionId: '12', method: 'cash', cardNumber: '4111111111111111' }, NOW))
      .toEqual({ sessionId: 12, method: 'cash', cardNumber: null });
  });

  test('a card number is cleaned of spaces and hyphens', () => {
    expect(validatePayment({ sessionId: 1, method: 'card', cardNumber: '4111 1111-1111 1111', cardExpiry: '12/30' }, NOW).cardNumber)
      .toBe('4111111111111111');
  });

  test('the Luhn check catches a mistyped digit', () => {
    expect(passesLuhn('4111111111111111')).toBe(true);
    expect(passesLuhn('4000000000000002')).toBe(true);
    expect(passesLuhn('4111111111111112')).toBe(false);
  });

  test.each([
    ['too short', '41111111111'],
    ['too long', '41111111111111111111'],
    ['letters', '4111abcd11111111'],
    ['a number, not text', 4111111111111111],
  ])('a card number that is %s is invalid', (_label, cardNumber) => {
    expect(fieldsOf({ sessionId: 1, method: 'card', cardNumber, cardExpiry: '12/30' })).toEqual({ cardNumber: 'Enter a valid card number' });
  });

  test('a card is valid until the end of its expiry month', () => {
    expect(fieldsOf({ sessionId: 1, method: 'card', cardNumber: '4111111111111111', cardExpiry: '10/26' })).toBeNull();
    expect(fieldsOf({ sessionId: 1, method: 'card', cardNumber: '4111111111111111', cardExpiry: '09/26' }))
      .toEqual({ cardExpiry: 'This card has expired' });
  });

  test.each(['13/30', '1/30', '2030-12', ''])('the expiry "%s" is not MM/YY', (cardExpiry) => {
    expect(fieldsOf({ sessionId: 1, method: 'card', cardNumber: '4111111111111111', cardExpiry }))
      .toEqual({ cardExpiry: 'Enter the expiry date as MM/YY' });
  });

  test('an unknown method or a bad session id is rejected', () => {
    expect(fieldsOf({ sessionId: 0, method: 'bitcoin' })).toEqual({
      sessionId: 'Choose a parking session to pay for',
      method: 'Choose a payment method',
    });
    expect(fieldsOf({ sessionId: '1abc', method: 'upi' })).toEqual({ sessionId: 'Choose a parking session to pay for' });
  });
});