const { hashPassword, verifyPassword } = require('../../server/src/modules/users/password');

describe('password hashing', () => {
  test('stores a bcrypt hash, never the plain password', async () => {
    const hash = await hashPassword('Abc@123');
    expect(hash).not.toContain('Abc@123');
    expect(hash).toMatch(/^\$2[aby]\$10\$.{53}$/);
  });

  test('the hash is 60 characters, matching the password_hash CHAR(60) column', async () => {
    const hash = await hashPassword('Abc@123');
    expect(hash).toHaveLength(60);
  });

  test('uses a cost factor of at least 10', async () => {
    const hash = await hashPassword('Abc@123');
    expect(Number(hash.split('$')[2])).toBeGreaterThanOrEqual(10);
  });

  test('uses a new random salt every time', async () => {
    const [a, b] = await Promise.all([hashPassword('Abc@123'), hashPassword('Abc@123')]);
    expect(a).not.toBe(b);
    await expect(verifyPassword('Abc@123', a)).resolves.toBe(true);
    await expect(verifyPassword('Abc@123', b)).resolves.toBe(true);
  });

  test('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('Abc@123');
    await expect(verifyPassword('Abc@123', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false);
  });

  test('the stored hash cannot be used as the password', async () => {
    const hash = await hashPassword('Abc@123');
    await expect(verifyPassword(hash, hash)).resolves.toBe(false);
  });

  test('rejects any password when there is no stored hash', async () => {
    await expect(verifyPassword('Abc@123', null)).resolves.toBe(false);
  });
});