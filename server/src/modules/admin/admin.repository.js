const db = require('../../db');

// LIKE treats % and _ as wildcards; a search for "50%" should find "50%" only.
function likePattern(text) {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// Newest first. Never selects password_hash (NFR-18).
async function findUsers({ role, search }) {
  const where = [];
  const params = [];
  if (role) {
    where.push('u.role = ?');
    params.push(role);
  }
  if (search) {
    where.push('(u.name LIKE ? OR u.email LIKE ?)');
    params.push(likePattern(search), likePattern(search));
  }

  const [rows] = await db.query(
    `SELECT u.id, u.name, u.email, u.role, u.created_at AS createdAt,
            (SELECT COUNT(*) FROM vehicles v WHERE v.user_id = u.id) AS vehicleCount
       FROM users u
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY u.created_at DESC, u.id DESC`,
    params,
  );
  return rows;
}

// Parking sessions keep their vehicle (ON DELETE RESTRICT), so a user or vehicle
// with history cannot be removed without losing it.
async function countSessionsForUser(userId) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS n FROM parking_sessions s
       JOIN vehicles v ON v.id = s.vehicle_id
      WHERE v.user_id = ?`,
    [userId],
  );
  return rows[0].n;
}

async function countSessionsForVehicle(vehicleId) {
  const [rows] = await db.query('SELECT COUNT(*) AS n FROM parking_sessions WHERE vehicle_id = ?', [vehicleId]);
  return rows[0].n;
}

// Vehicles, reservations and login sessions go with the user (ON DELETE CASCADE).
async function deleteUser(id) {
  const [result] = await db.query('DELETE FROM users WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

// Any user's vehicle, for the admin. Returns the owner's id so the vehicles
// repository's owner-scoped update and remove can be reused.
async function findVehicleOwner(vehicleId) {
  const [rows] = await db.query('SELECT user_id AS userId FROM vehicles WHERE id = ?', [vehicleId]);
  return rows[0] ? rows[0].userId : null;
}

module.exports = {
  findUsers,
  countSessionsForUser,
  countSessionsForVehicle,
  deleteUser,
  findVehicleOwner,
};
