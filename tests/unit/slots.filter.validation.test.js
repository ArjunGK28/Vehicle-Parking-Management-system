const { validateSlotFilter } = require('../../server/src/modules/slots/slots.validation');

function fieldErrors(fn) {
  try {
    fn();
  } catch (err) {
    expect(err.status).toBe(400);
    return err.fields;
  }
  throw new Error('expected a validation error');
}

describe('validateSlotFilter (FR-03)', () => {
  test('no filter at all means no restriction', () => {
    expect(validateSlotFilter({})).toEqual({ status: null, type: null });
    expect(validateSlotFilter()).toEqual({ status: null, type: null });
  });

  test('empty strings mean no restriction', () => {
    expect(validateSlotFilter({ status: '', type: '' })).toEqual({ status: null, type: null });
  });

  test.each(['available', 'occupied', 'reserved', 'unavailable'])('accepts status %p', (status) => {
    expect(validateSlotFilter({ status }).status).toBe(status);
  });

  test.each(['two_wheeler', 'four_wheeler'])('accepts type %p', (type) => {
    expect(validateSlotFilter({ type }).type).toBe(type);
  });

  test.each(['free', 'AVAILABLE', ' available', 'truck'])('rejects status %p', (status) => {
    expect(fieldErrors(() => validateSlotFilter({ status }))).toEqual({
      status: 'Choose available, occupied, reserved or unavailable',
    });
  });

  test('rejects an unknown type', () => {
    expect(fieldErrors(() => validateSlotFilter({ type: 'truck' }))).toEqual({
      type: 'Choose two-wheeler or four-wheeler',
    });
  });

  test('rejects repeated parameters (arrays)', () => {
    expect(Object.keys(fieldErrors(() => validateSlotFilter({ status: ['available', 'occupied'], type: ['x'] }))).sort())
      .toEqual(['status', 'type']);
  });
});