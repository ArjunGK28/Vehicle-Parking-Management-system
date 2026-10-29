const { HttpError } = require('../../errors');

// FR-10: the ways to pay. Cash is handed to the attendant, so only staff may record it.
const METHODS = Object.freeze([
  { id: 'cash', label: 'Cash', staffOnly: true },
  { id: 'upi', label: 'UPI' },
  { id: 'card', label: 'Card' },
]);
const METHOD_IDS = METHODS.map((m) => m.id);

// Accepts 12 or "12"; anything else gives null.
function asId(value) {
  if (Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value.trim())) return Number(value);
  return null;
}

// Standard card check digit (Luhn): catches a mistyped digit before "charging" anything.
function passesLuhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

// "4111 1111-1111 1111" -> "4111111111111111", or null if it is not a valid card number.
function cleanCardNumber(raw) {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[\s-]/g, '');
  if (!/^\d{12,19}$/.test(digits) || !passesLuhn(digits)) return null;
  return digits;
}

// "MM/YY" -> { month, year }, or null. A card is valid until the end of its expiry month.
function parseExpiry(raw) {
  const match = typeof raw === 'string' ? /^(\d{2})\/(\d{2})$/.exec(raw.trim()) : null;
  if (!match) return null;
  const month = Number(match[1]);
  if (month < 1 || month > 12) return null;
  return { month, year: 2000 + Number(match[2]) };
}

function isExpired({ month, year }, now) {
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;
  return year < thisYear || (year === thisYear && month < thisMonth);
}

// FR-10: returns clean { sessionId, method, cardNumber } or throws a 400 with per-field
// messages. cardNumber is only kept for card payments; the expiry is checked, never returned,
// so it cannot reach the database (NFR-18).
function validatePayment(body = {}, now = new Date()) {
  const fields = {};

  const sessionId = asId(body.sessionId);
  if (!sessionId) fields.sessionId = 'Choose a parking session to pay for';

  const method = typeof body.method === 'string' ? body.method.trim() : '';
  if (!METHOD_IDS.includes(method)) fields.method = 'Choose a payment method';

  let cardNumber = null;
  if (method === 'card') {
    cardNumber = cleanCardNumber(body.cardNumber);
    if (!cardNumber) fields.cardNumber = 'Enter a valid card number';

    const expiry = parseExpiry(body.cardExpiry);
    if (!expiry) fields.cardExpiry = 'Enter the expiry date as MM/YY';
    else if (isExpired(expiry, now)) fields.cardExpiry = 'This card has expired';
  }

  if (Object.keys(fields).length > 0) {
    throw new HttpError(400, 'Please correct the highlighted fields', fields);
  }

  return { sessionId, method, cardNumber };
}

module.exports = { METHODS, validatePayment, passesLuhn };