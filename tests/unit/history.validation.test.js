const { validatePageQuery } = require('../../server/src/modules/history/history.validation');

function fieldErrors(fn) {
  try {
    fn();
  } catch (err) {
    expect(err.status).toBe(400);
    return err.fields;
  }
  throw new Error('expected a validation error');
}

describe('validatePageQuery (FR-11)', () => {
  test('no paging means the first page of 20', () => {
    expect(validatePageQuery({})).toEqual({ page: 1, pageSize: 20 });
    expect(validatePageQuery()).toEqual({ page: 1, pageSize: 20 });
    expect(validatePageQuery({ page: '', pageSize: '' })).toEqual({ page: 1, pageSize: 20 });
  });

  test('reads page and page size', () => {
    expect(validatePageQuery({ page: '3', pageSize: '100' })).toEqual({ page: 3, pageSize: 100 });
  });

  test.each(['0', '-1', '1.5', 'abc', '1e3', ' 2'])('rejects page %p', (page) => {
    expect(fieldErrors(() => validatePageQuery({ page }))).toEqual({ page: 'Page must be a whole number from 1' });
  });

  test.each(['0', '101', 'ten', '-5'])('rejects page size %p', (pageSize) => {
    expect(fieldErrors(() => validatePageQuery({ pageSize }))).toEqual({
      pageSize: 'Page size must be a whole number from 1 to 100',
    });
  });

  test('rejects repeated parameters (arrays)', () => {
    expect(Object.keys(fieldErrors(() => validatePageQuery({ page: ['1', '2'], pageSize: ['5'] }))).sort()).toEqual([
      'page',
      'pageSize',
    ]);
  });
});