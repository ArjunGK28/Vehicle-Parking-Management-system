const db = require('../../db');

// Every query takes the range as [from 00:00, the day after to 00:00), so the end date is
// included in full. Dates are grouped with DATE() in MySQL, the same clock that records them.
const RANGE = (column) => `${column} >= ? AND ${column} < DATE_ADD(?, INTERVAL 1 DAY)`;

async function totals(from, to) {
  const [[entries]] = await db.query(
    `SELECT COUNT(*) AS n FROM parking_sessions WHERE ${RANGE('entry_time')}`,
    [from, to],
  );
  // A session has exited once it has an exit time, whether or not it is paid yet.
  const [[exits]] = await db.query(
    `SELECT COUNT(*) AS n,
            AVG(TIMESTAMPDIFF(MINUTE, entry_time, exit_time)) AS averageStay,
            COALESCE(SUM(CASE WHEN payment_status = 'unpaid' THEN fee_amount END), 0) AS unpaidFees
       FROM parking_sessions
      WHERE exit_time IS NOT NULL AND ${RANGE('exit_time')}`,
    [from, to],
  );
  const [[revenue]] = await db.query(
    `SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total
       FROM payments WHERE status = 'paid' AND ${RANGE('created_at')}`,
    [from, to],
  );
  // A reservation counts when any part of it falls in the range (ST-04_06).
  const [[reservations]] = await db.query(
    `SELECT COUNT(*) AS n FROM reservations
      WHERE status <> 'cancelled'
        AND start_time < DATE_ADD(?, INTERVAL 1 DAY) AND end_time > ?`,
    [to, from],
  );

  return {
    entries: entries.n,
    exits: exits.n,
    averageStayMinutes: exits.averageStay === null ? null : Math.round(Number(exits.averageStay)),
    unpaidFees: Number(exits.unpaidFees),
    payments: revenue.n,
    revenue: Number(revenue.total),
    reservations: reservations.n,
  };
}

// { 'YYYY-MM-DD': count } for one date column.
async function countByDay(sql, from, to) {
  const [rows] = await db.query(sql, [from, to]);
  return Object.fromEntries(rows.map((r) => [r.day, Number(r.value)]));
}

async function daily(from, to) {
  const [entries, exits, revenue, reservations] = await Promise.all([
    countByDay(
      `SELECT DATE_FORMAT(entry_time, '%Y-%m-%d') AS day, COUNT(*) AS value
         FROM parking_sessions WHERE ${RANGE('entry_time')} GROUP BY day`,
      from, to,
    ),
    countByDay(
      `SELECT DATE_FORMAT(exit_time, '%Y-%m-%d') AS day, COUNT(*) AS value
         FROM parking_sessions WHERE exit_time IS NOT NULL AND ${RANGE('exit_time')} GROUP BY day`,
      from, to,
    ),
    countByDay(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS day, SUM(amount) AS value
         FROM payments WHERE status = 'paid' AND ${RANGE('created_at')} GROUP BY day`,
      from, to,
    ),
    // Counted on the day the reservation starts.
    countByDay(
      `SELECT DATE_FORMAT(start_time, '%Y-%m-%d') AS day, COUNT(*) AS value
         FROM reservations WHERE status <> 'cancelled' AND ${RANGE('start_time')} GROUP BY day`,
      from, to,
    ),
  ]);
  return { entries, exits, revenue, reservations };
}

module.exports = { totals, daily };
