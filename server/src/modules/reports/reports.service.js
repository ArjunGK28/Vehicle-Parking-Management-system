const reports = require('./reports.repository');
const slots = require('../slots/slots.repository');
const { ALL_SLOT_STATUSES } = require('../slots/slotStatuses');
const { ALL_SLOT_TYPES } = require('../slots/slotTypes');
const { datesBetween } = require('./reports.validation');

// Slots in each status, with the share of usable slots that are taken.
// Reserved slots count as taken, so a reservation shows in the occupancy (ST-04_06).
function summarise(list) {
  const counts = { total: list.length };
  for (const status of ALL_SLOT_STATUSES) counts[status] = 0;
  for (const slot of list) counts[slot.status] += 1;

  const usable = counts.total - counts.unavailable;
  counts.occupancyPercent = usable === 0 ? 0 : Math.round(((counts.occupied + counts.reserved) / usable) * 100);
  return counts;
}

// UC-12 / FR-12: the occupancy report (UT-12_01). "current" is the facility right now;
// "period" and "days" cover the chosen dates, both included.
async function occupancy({ from, to }) {
  const [allSlots, period, byDay] = await Promise.all([
    slots.findAll(),
    reports.totals(from, to),
    reports.daily(from, to),
  ]);

  const byType = {};
  for (const type of ALL_SLOT_TYPES) byType[type] = summarise(allSlots.filter((s) => s.type === type));

  const days = datesBetween(from, to).map((date) => ({
    date,
    entries: byDay.entries[date] || 0,
    exits: byDay.exits[date] || 0,
    revenue: byDay.revenue[date] || 0,
    reservations: byDay.reservations[date] || 0,
  }));

  return { from, to, current: { ...summarise(allSlots), byType }, period, days };
}

module.exports = { occupancy };
