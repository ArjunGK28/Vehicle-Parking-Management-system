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
