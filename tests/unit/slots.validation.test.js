const {
  validateNewSlot,
  validateSlotUpdate,
  parseSlotId,
} = require('../../server/src/modules/slots/slots.validation');

function fieldErrors(fn) {
  try {
    fn();
  } catch (err) {
    expect(err.status).toBe(400);
    return err.fields;
  }
  throw new Error('expected a validation error');
}

describe('validateNewSlot', () => {
  test('accepts the Test Plan slot and normalises the code (IT-12_05 data)', () => {
    expect(validateNewSlot({ code: ' p-30 ', type: 'four_wheeler' })).toEqual({ code: 'P-30', type: 'four_wheeler' });
  });

  test('accepts both slot types', () => {
    expect(validateNewSlot({ code: 'T1', type: 'two_wheeler' }).type).toBe('two_wheeler');
  });

  test('reports every missing field at once', () => {
    expect(fieldErrors(() => validateNewSlot({}))).toEqual({
      code: 'Slot code is required',
      type: 'Slot type is required',
    });
  });

  test.each(['P 30', 'P_30', '-P30', 'P30-', 'P--30', 'A'.repeat(11)])('rejects the code %p', (code) => {
    expect(fieldErrors(() => validateNewSlot({ code, type: 'four_wheeler' }))).toEqual({
      code: 'Use up to 10 letters, digits and hyphens, e.g. P-30',
    });
  });

  test('rejects an unknown slot type', () => {
    expect(fieldErrors(() => validateNewSlot({ code: 'P-30', type: 'truck' }))).toEqual({
      type: 'Choose two-wheeler or four-wheeler',
    });
  });

  test('ignores non-string values', () => {
    const fields = fieldErrors(() => validateNewSlot({ code: 30, type: ['four_wheeler'] }));
    expect(Object.keys(fields).sort()).toEqual(['code', 'type']);
  });
});

describe('validateSlotUpdate', () => {
  test('accepts true and false', () => {
    expect(validateSlotUpdate({ disabled: true })).toEqual({ disabled: true });
    expect(validateSlotUpdate({ disabled: false })).toEqual({ disabled: false });
  });

  test.each([undefined, 'true', 1, null])('rejects disabled = %p', (disabled) => {
    expect(fieldErrors(() => validateSlotUpdate({ disabled }))).toEqual({ disabled: 'Must be true or false' });
  });
});

describe('parseSlotId', () => {
  test('reads a positive whole number', () => {
    expect(parseSlotId('42')).toBe(42);
  });

  test.each(['0', '-1', '1abc', '1.5', '', '01'])('treats %p as a missing slot', (id) => {
    expect(() => parseSlotId(id)).toThrow(expect.objectContaining({ status: 404 }));
  });
});
