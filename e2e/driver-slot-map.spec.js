// FR-03 on the driver dashboard: a live map of the lot, grouped by vehicle type,
// green for a free bay and red once a vehicle parks there.
const { test, expect } = require('@playwright/test');
const { ACCOUNTS, resetData } = require('./support/data');
const { login } = require('./support/pages');

const PLATE = 'KA01AB1234';

test('the driver dashboard map turns a bay red when a vehicle parks in it', async ({ page, browser }) => {
  await resetData({ vehicles: [{ plate: PLATE }] });
  await login(page, ACCOUNTS.driver);

  const map = page.getByRole('region', { name: 'Live parking map' });
  const cars = map.getByRole('region', { name: 'Four-wheeler bays' });
  const bikes = map.getByRole('region', { name: 'Two-wheeler bays' });
  await expect(cars.getByRole('listitem')).toHaveCount(10);
  await expect(bikes.getByRole('listitem')).toHaveCount(5);
  await expect(cars).toContainText('10 of 10 free');

  // Drivers can look but not edit.
  await expect(map.getByRole('button')).toHaveCount(0);

  const bay = cars.getByRole('listitem', { name: /^P-01,/ });
  await expect(bay).toHaveAttribute('data-status', 'available');
  await expect(bay).toHaveClass(/bay-free/);

  // An attendant parks the vehicle in another browser; the driver's map catches up by itself.
  const staff = await browser.newContext();
  const attendant = await staff.newPage();
  await login(attendant, ACCOUNTS.attendant);
  await attendant.getByRole('link', { name: 'Vehicle entry' }).click();
  await attendant.getByLabel('Registration number').fill(PLATE);
  await attendant.keyboard.press('Enter');
  await expect(attendant.getByText('Go to P-01')).toBeVisible();
  await staff.close();

  await expect(bay).toHaveAttribute('data-status', 'occupied');
  await expect(bay).toHaveClass(/bay-taken/);
  await expect(cars).toContainText('9 of 10 free');
});

test('an administrator takes a bay out of service, puts it back and adds a bay from the map (UC-12)', async ({ page }) => {
  await resetData();
  await login(page, ACCOUNTS.admin);

  const map = page.getByRole('region', { name: 'Live parking map' });
  const cars = map.getByRole('region', { name: 'Four-wheeler bays' });
  const bikes = map.getByRole('region', { name: 'Two-wheeler bays' });
  const bay = cars.getByRole('listitem', { name: /^P-03,/ });

  await cars.getByRole('button', { name: /^P-03,/ }).click();
  await map.getByRole('button', { name: 'Take out of service' }).click();
  await expect(page.getByText('Slot P-03 is now unavailable.')).toBeVisible();
  await expect(bay).toHaveAttribute('data-status', 'unavailable');
  await expect(bay).toHaveClass(/bay-closed/);
  await expect(cars).toContainText('9 of 10 free');

  await map.getByRole('button', { name: 'Put back in service' }).click();
  await expect(page.getByText('Slot P-03 is now available.')).toBeVisible();
  await expect(bay).toHaveAttribute('data-status', 'available');
  await map.getByRole('button', { name: 'Done' }).click();
  await expect(map.getByRole('group', { name: 'Edit P-03' })).toHaveCount(0);

  // The code after the last two-wheeler bay is suggested.
  await bikes.getByRole('button', { name: '+ Add two-wheeler bay' }).click();
  await expect(bikes.getByLabel('New two-wheeler bay code')).toHaveValue('B-06');
  await bikes.getByRole('button', { name: 'Add bay' }).click();
  await expect(page.getByText('Slot B-06 added.')).toBeVisible();
  await expect(bikes.getByRole('listitem', { name: 'B-06, Two-wheeler, Available' })).toBeVisible();
  await expect(bikes).toContainText('6 of 6 free');

  // A code already in use is refused next to the field.
  await bikes.getByRole('button', { name: '+ Add two-wheeler bay' }).click();
  await bikes.getByLabel('New two-wheeler bay code').fill('P-01');
  await bikes.getByRole('button', { name: 'Add bay' }).click();
  await expect(bikes.getByText('This slot code is already in use')).toBeVisible();
});
