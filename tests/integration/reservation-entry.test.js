// A driver with a reservation arrives: the reservation holds the slot against everyone
// else (DR-08), but must not hold it against its own vehicle.
const { ROLES } = require('../../server/src/modules/users/roles');
const { db, clearTables } = require('../helpers/db');
const { createUser, loginAs } = require('../helpers/users');

const PLATE = 'KA01AB1234';
const OTHER_PLATE = 'KA02CD5678';

let attendant;
let driver;
let vehicleId;
let slotIds;

beforeEach(async () => {
  await clearTables();
  const admin = await loginAs(await createUser(ROLES.ADMIN));
  attendant = await loginAs(await createUser(ROLES.ATTENDANT));
  driver = await loginAs(await createUser(ROLES.DRIVER));
  const otherDriver = await loginAs(await createUser(ROLES.DRIVER, { email: 'other-driver@example.com' }));

  const vehicle = await driver.post('/api/vehicles').send({ registrationNumber: PLATE, type: 'four_wheeler', model: 'Swift', colour: 'Red' });
  expect(vehicle.status).toBe(201);
  vehicleId = vehicle.body.vehicle.id;
  const other = await otherDriver.post('/api/vehicles').send({ registrationNumber: OTHER_PLATE, type: 'four_wheeler', model: 'Baleno', colour: 'Blue' });
  expect(other.status).toBe(201);

  expect((await admin.put('/api/rates/four_wheeler').send({ hourlyRate: 20, minimumFee: 10, billingStepMinutes: 15 })).status).toBe(200);

  slotIds = {};
  for (const code of ['P-01', 'P-02']) {
    const slot = await admin.post('/api/slots').send({ code, type: 'four_wheeler' });
    expect(slot.status).toBe(201);
    slotIds[code] = slot.body.slot.id;
  }
});

afterAll(() => db.end());

const enter = (registrationNumber = PLATE) => attendant.post('/api/parking/entry').send({ registrationNumber });
const slotStatus = async (code) => (await attendant.get('/api/slots')).body.slots.find((s) => s.code === code).status;
const reservationStatus = async () => (await driver.get('/api/reservations')).body.reservations[0].status;

// Written directly, so a test can also reserve a slot the API would refuse at this moment.
async function reserve(code, { fromMinutes = -60, toMinutes = 60, vehicle = vehicleId } = {}) {
  await db.query(
    `INSERT INTO reservations (user_id, vehicle_id, slot_id, start_time, end_time)
     SELECT user_id, id, ?, NOW() + INTERVAL ? MINUTE, NOW() + INTERVAL ? MINUTE
     FROM vehicles WHERE id = ?`,
    [slotIds[code], fromMinutes, toMinutes, vehicle],
  );
}

async function disableOtherSlots(code) {
  await db.query('UPDATE parking_slots SET is_disabled = TRUE WHERE id <> ?', [slotIds[code]]);
}

describe('the vehicle with the reservation arrives', () => {
  test('it enters when its reserved slot is the only one left', async () => {
    await reserve('P-01');
    await disableOtherSlots('P-01');

    const res = await enter();

    expect(res.status).toBe(201);
    expect(res.body.session.slotCode).toBe('P-01');
  });

  test('it goes to the slot it reserved, not the first free one', async () => {
    await reserve('P-02');

    const res = await enter();

    expect(res.status).toBe(201);
    expect(res.body.session.slotCode).toBe('P-02');
    expect(await slotStatus('P-02')).toBe('occupied');
  });

  test('a reservation made through the API works the same way', async () => {
    const made = await driver.post('/api/reservations').send({
      vehicleId,
      slotId: slotIds['P-02'],
      startTime: new Date(Date.now() - 3600000).toISOString(),
      endTime: new Date(Date.now() + 3600000).toISOString(),
    });
    expect(made.status).toBe(201);

    const res = await enter();

    expect(res.body.session.slotCode).toBe('P-02');
  });

  test('the reservation is marked completed', async () => {
    await reserve('P-02');
    expect(await reservationStatus()).toBe('reserved');

    await enter();

    expect(await reservationStatus()).toBe('completed');
  });

  test('once the stay is paid the slot is Available, even if the reserved time has not ended', async () => {
    await reserve('P-02');
    await enter();

    const out = await attendant.post('/api/parking/exit').send({ registrationNumber: PLATE });
    expect(out.status).toBe(200);
    const paid = await attendant.post('/api/payments').send({ sessionId: out.body.session.id, method: 'cash' });
    expect(paid.status).toBe(201);

    expect(await slotStatus('P-02')).toBe('available');
  });

  test('the attendant entry and the driver entry behave the same', async () => {
    await reserve('P-02');

    const res = await driver.post('/api/parking/assign').send({ vehicleId });

    expect(res.status).toBe(201);
    expect(res.body.session.slotCode).toBe('P-02');
  });
});

describe('the reserved slot cannot take the vehicle', () => {
  test('still occupied: it gets another free slot and the reservation is used', async () => {
    expect((await enter(OTHER_PLATE)).body.session.slotCode).toBe('P-01');
    await reserve('P-01');

    const res = await enter();

    expect(res.status).toBe(201);
    expect(res.body.session.slotCode).toBe('P-02');
    expect(await reservationStatus()).toBe('completed');
  });

  test('disabled by an admin: it gets another free slot', async () => {
    await reserve('P-01');
    await db.query('UPDATE parking_slots SET is_disabled = TRUE WHERE id = ?', [slotIds['P-01']]);

    const res = await enter();

    expect(res.status).toBe(201);
    expect(res.body.session.slotCode).toBe('P-02');
  });

  test('occupied and no other slot free: refused, and the reservation is kept', async () => {
    await disableOtherSlots('P-01');
    expect((await enter(OTHER_PLATE)).status).toBe(201);
    await reserve('P-01');

    const res = await enter();

    expect(res.status).toBe(409);
    expect(await reservationStatus()).toBe('reserved');
  });

  test('wrong vehicle type: it is not parked in the reserved slot (DR-07)', async () => {
    const bike = await driver.post('/api/vehicles').send({ registrationNumber: 'KA03EF9012', type: 'two_wheeler', model: 'Activa', colour: 'Grey' });
    await reserve('P-01', { vehicle: bike.body.vehicle.id });

    const res = await enter('KA03EF9012');

    expect(res.status).toBe(409);
  });
});

describe('the reservation still holds the slot against everything else', () => {
  test('another vehicle is refused the reserved slot (DR-08)', async () => {
    await reserve('P-01');
    await disableOtherSlots('P-01');

    const res = await enter(OTHER_PLATE);

    expect(res.status).toBe(409);
    expect(await reservationStatus()).toBe('reserved');
  });

  test('another vehicle is sent to a different slot, and the holder still gets theirs', async () => {
    await reserve('P-01');

    expect((await enter(OTHER_PLATE)).body.session.slotCode).toBe('P-02');
    expect((await enter()).body.session.slotCode).toBe('P-01');
  });

  test('a reservation for later is neither used nor completed by entering now', async () => {
    await reserve('P-02', { fromMinutes: 120, toMinutes: 180 });

    const res = await enter();

    expect(res.status).toBe(201);
    expect(res.body.session.slotCode).toBe('P-01');
    expect(await reservationStatus()).toBe('reserved');
  });

  test('a reservation that has ended is ignored', async () => {
    await reserve('P-02', { fromMinutes: -180, toMinutes: -120 });

    const res = await enter();

    expect(res.body.session.slotCode).toBe('P-01');
    expect(await reservationStatus()).toBe('reserved');
  });

  test('a cancelled reservation is ignored', async () => {
    await reserve('P-02');
    await db.query("UPDATE reservations SET status = 'cancelled'");

    const res = await enter();

    expect(res.body.session.slotCode).toBe('P-01');
    expect(await reservationStatus()).toBe('cancelled');
  });
});
