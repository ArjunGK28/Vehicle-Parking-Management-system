// Issue #50 (NFR-08): all main flows work in Chrome, Edge and Firefox.
// The same tests run once per browser project (see playwright.config.js).
const { test, expect } = require('@playwright/test');
const { ACCOUNTS, resetData } = require('./support/data');
const { login } = require('./support/pages');

const PLATE = 'KA01AB1234';

test.describe('main flows', () => {
  test('a new driver registers, logs in and registers a vehicle (UC-01, FR-02)', async ({ page }) => {
    await resetData();

    await page.goto('/register');
    await page.getByLabel('Full name').fill('Browser Driver');
    await page.getByLabel('Email').fill('browser.driver@e2e.test');
    await page.getByLabel('Password').fill('Abc@1234');
    await page.getByRole('button', { name: 'Register' }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('Account created. You can now log in.')).toBeVisible();

    await page.getByLabel('Password').fill('Abc@1234');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/driver$/);

    await page.getByRole('link', { name: 'My vehicles' }).click();
    await expect(page.getByRole('heading', { name: 'My vehicles' })).toBeVisible();
    await page.getByLabel('Registration number').fill(PLATE);
    await page.getByLabel('Model').fill('Swift');
    await page.getByLabel('Colour').fill('Red');
    await page.getByRole('button', { name: 'Register vehicle' }).click();

    await expect(page.getByText(`${PLATE} registered.`)).toBeVisible();
  });

  test('an attendant records entry, sees the slot occupied, finds the vehicle and records exit (UC-05, UC-03, UC-07, UC-08)', async ({ page }) => {
    await resetData({ vehicles: [{ plate: PLATE }] });
    await login(page, ACCOUNTS.attendant);

    // Entry
    await page.getByRole('link', { name: 'Vehicle entry' }).click();
    await page.getByLabel('Registration number').fill(PLATE);
    await page.keyboard.press('Enter');
    await expect(page.getByText('Go to P-01')).toBeVisible();

    // Availability
    await page.getByRole('link', { name: 'Attendant dashboard' }).click();
    await page.getByRole('link', { name: 'Slot availability' }).click();
    await expect(page.getByRole('heading', { name: 'Slot availability' })).toBeVisible();
    await expect(page.locator('.slot-tile', { hasText: 'P-01' })).toContainText('Occupied');

    // Locate
    await page.getByRole('link', { name: 'Dashboard', exact: false }).first().click();
    await page.getByRole('link', { name: 'Track vehicle' }).click();
    await page.getByLabel('Registration number').fill(PLATE);
    await page.getByRole('button', { name: 'Find vehicle' }).click();
    await expect(page.getByText(`Vehicle ${PLATE} is in slot P-01.`)).toBeVisible();

    // Exit
    await page.getByRole('link', { name: 'Dashboard', exact: false }).first().click();
    await page.getByRole('link', { name: 'Vehicle exit' }).click();
    await page.getByLabel('Registration number').fill(PLATE);
    await page.getByRole('button', { name: 'Confirm exit' }).click();
    await expect(page.getByRole('heading', { name: 'Exit summary' })).toBeVisible();
    await expect(page.getByText(/Fee ₹\d+/).first()).toBeVisible();
  });

  test('a driver sees a finished stay in parking history (UC-11)', async ({ page, request }) => {
    await resetData({ vehicles: [{ plate: PLATE }] });

    // The attendant's part is done through the API; this test is about the driver's page.
    await request.post('/api/auth/login', { data: { email: ACCOUNTS.attendant.email, password: ACCOUNTS.attendant.password } });
    expect((await request.post('/api/parking/entry', { data: { registrationNumber: PLATE } })).status()).toBe(201);
    expect((await request.post('/api/parking/exit', { data: { registrationNumber: PLATE } })).status()).toBe(200);

    await login(page, ACCOUNTS.driver);
    await page.getByRole('link', { name: 'Parking history' }).click();

    await expect(page.getByRole('heading', { name: 'Parking history' })).toBeVisible();
    const row = page.getByRole('row', { name: new RegExp(PLATE) });
    await expect(row).toContainText('P-01');
    await expect(row).toContainText('Completed');
  });

  test('an administrator adds a slot, opens the rates page and adds a user (UC-12)', async ({ page }) => {
    await resetData();
    await login(page, ACCOUNTS.admin);

    await page.getByRole('link', { name: 'Parking slots' }).click();
    await page.getByLabel('Slot code').fill('Z-99');
    await page.getByRole('button', { name: 'Add slot' }).click();
    await expect(page.getByText('Slot Z-99 added.')).toBeVisible();

    await page.getByRole('link', { name: 'Administrator dashboard' }).click();
    await page.getByRole('link', { name: 'Parking rates' }).click();
    await expect(page.getByRole('heading', { name: 'Parking rates' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save four-wheeler rate' })).toBeVisible();

    await page.getByRole('link', { name: 'Administrator dashboard' }).click();
    await page.getByRole('link', { name: 'Users and vehicles' }).click();
    await page.getByLabel('Name', { exact: true }).fill('New Staff');
    await page.getByLabel('Email', { exact: true }).fill('new.staff@e2e.test');
    await page.getByLabel('Password', { exact: true }).fill('Abc@1234');
    await page.getByRole('button', { name: 'Add user' }).click();
    await expect(page.getByText('new.staff@e2e.test').first()).toBeVisible();
  });

  test('pages are protected: a driver cannot open admin pages, and log out ends the session (NFR-10, NFR-11)', async ({ page }) => {
    await resetData();

    await page.goto('/attendant');
    await expect(page).toHaveURL(/\/login$/);

    await login(page, ACCOUNTS.driver);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();

    await page.goto('/driver');
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/driver');
    await expect(page).toHaveURL(/\/login$/);
  });
});