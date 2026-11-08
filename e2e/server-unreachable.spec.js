// When the API is down, the Vite dev proxy answers in its place with an empty 502.
// The page should say the server cannot be reached, not a bare "Request failed".
const { test, expect } = require('@playwright/test');

test('the register page says the server cannot be reached when a proxy answers 502', async ({ page }) => {
  await page.route('**/api/auth/register', (route) =>
    route.fulfill({ status: 502, contentType: 'text/plain', body: '' }));

  await page.goto('/register');
  await page.getByLabel('Full name').fill('Proxy Check');
  await page.getByLabel('Email').fill('proxy.check@e2e.test');
  await page.getByLabel('Password').fill('Abc@1234');
  await page.getByRole('button', { name: 'Register' }).click();

  await expect(page.getByText('Cannot reach the server. Check that it is running.')).toBeVisible();
  await expect(page.getByText('Request failed')).toHaveCount(0);
});
