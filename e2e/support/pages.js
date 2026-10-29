const { expect } = require('@playwright/test');

const HOME = { admin: /\/admin$/, attendant: /\/attendant$/, driver: /\/driver$/ };

// Logs in through the login page and waits for the role's dashboard.
async function login(page, account) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(HOME[account.role]);
}

module.exports = { login };