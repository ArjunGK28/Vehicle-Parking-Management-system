const { hashPassword, verifyPassword } = require('../../server/src/modules/users/password');

describe('password hashing', () => {
  test('stores a bcrypt hash, never the plain password', async () => {
    const hash = await hashPassword('Abc@123');
    expect(hash).not.toContain('Abc@123');
    expect(hash).toMatch(/^\$2[aby]\$10\$.{53}$/);
  });

  test('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('Abc@123');
    await expect(verifyPassword('Abc@123', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false);
  });

  test('rejects any password when there is no stored hash', async () => {
    await expect(verifyPassword('Abc@123', null)).resolves.toBe(false);
  });
});
