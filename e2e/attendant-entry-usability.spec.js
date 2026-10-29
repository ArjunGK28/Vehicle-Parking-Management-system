// Issue #52 (NFR-05, UC-05): a trained attendant completes a normal entry within 1 minute.
// A script is much faster than a person, so these tests prove the screen is simple (one field,
// keyboard only, ready for the next vehicle) and that the system's part is a tiny share of the
// minute.
const { test, expect } = require('@playwright/test');
const { ACCOUNTS, resetData } = require('./support/data');
const { login } = require('./support/pages');

const ONE_MINUTE_MS = 60 * 1000;
const SYSTEM_BUDGET_MS = 10 * 1000; // the system's share of one entry, far below the minute
const plate = (n) => `KA01AB${String(n).padStart(4, '0')}`;

function record(label, ms) {
  test.info().annotations.push({ type: 'timing', description: `${label}: ${(ms / 1000).toFixed(2)} s` });
}

async function openEntryPage(page) {
  await login(page, ACCOUNTS.attendant);
  await page.getByRole('link', { name: 'Vehicle entry' }).click();
  await expect(page.getByRole('heading', { name: 'Vehicle entry' })).toBeVisible();
}

test.describe('attendant entry (NFR-05)', () => {
  test('a normal entry from the login page to the slot on screen takes far less than 1 minute', async ({ page }) => {
    await resetData({ vehicles: [{ plate: plate(1) }] });

    const start = Date.now();
    await login(page, ACCOUNTS.attendant);
    await page.getByRole('link', { name: 'Vehicle entry' }).click();
    await page.getByLabel('Registration number').fill(plate(1));
    await page.keyboard.press('Enter');
    await expect(page.getByText('Go to P-01')).toBeVisible();
    const elapsed = Date.now() - start;

    record('login to slot shown', elapsed);
    expect(elapsed).toBeLessThan(ONE_MINUTE_MS);
  });

  test('the entry screen needs one field and works from the keyboard alone', async ({ page }) => {
    await resetData({ vehicles: [{ plate: plate(2) }] });
    await openEntryPage(page);

    // One thing to type, and the cursor is already in it.
    await expect(page.locator('form input')).toHaveCount(1);
    await expect(page.getByLabel('Registration number')).toBeFocused();

    await page.keyboard.type(plate(2));
    await page.keyboard.press('Enter');
    await expect(page.getByText('Go to P-01')).toBeVisible();
  });

  test('10 vehicles in a row: each entry is quick, and the field is empty and ready for the next one', async ({ page }) => {
    const plates = Array.from({ length: 10 }, (_, i) => plate(i + 10));
    await resetData({ vehicles: plates.map((p) => ({ plate: p })) });
    await openEntryPage(page);
    const field = page.getByLabel('Registration number');

    const durations = [];
    for (const [i, p] of plates.entries()) {
      const start = Date.now();
      await field.fill(p);
      await page.keyboard.press('Enter');
      await expect(page.getByText(`Go to P-${String(i + 1).padStart(2, '0')}`)).toBeVisible();
      durations.push(Date.now() - start);

      await expect(field).toHaveValue('');
      await expect(field).toBeFocused();
    }

    record('slowest of 10 entries', Math.max(...durations));
    expect(Math.max(...durations)).toBeLessThan(SYSTEM_BUDGET_MS);
  });

  test('a mistake is easy to fix: an unknown number shows a message, keeps the text, and the right number then works', async ({ page }) => {
    await resetData({ vehicles: [{ plate: plate(30) }] });
    await openEntryPage(page);
    const field = page.getByLabel('Registration number');

    const start = Date.now();
    await field.fill(plate(31)); // a typing error: this vehicle is not registered
    await page.keyboard.press('Enter');
    await expect(page.getByText('Vehicle not found')).toBeVisible();
    await expect(field).toBeFocused();
    await expect(field).toHaveValue(plate(31));

    await field.fill(plate(30));
    await page.keyboard.press('Enter');
    await expect(page.getByText('Go to P-01')).toBeVisible();
    const elapsed = Date.now() - start;

    record('entry with one correction', elapsed);
    expect(elapsed).toBeLessThan(ONE_MINUTE_MS);
  });

  test('pressing Enter on an empty field says what to do', async ({ page }) => {
    await resetData();
    await openEntryPage(page);

    await page.keyboard.press('Enter');

    await expect(page.getByText('Enter a registration number')).toBeVisible();
    await expect(page.getByLabel('Registration number')).toBeFocused();
  });
});