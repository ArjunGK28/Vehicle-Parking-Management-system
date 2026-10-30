const db = require('../../db');

async function create({ adminId, adminName, adminEmail, action, summary }) {
  await db.query(
    'INSERT INTO audit_log (admin_id, admin_name, admin_email, action, summary) VALUES (?, ?, ?, ?, ?)',
    [adminId, adminName, adminEmail, action, summary],
  );
}

// Newest first. Returns { entries, total } for one page.
async function findPage({ action, limit, offset }) {
  const where = action ? 'WHERE action = ?' : '';
  const params = action ? [action] : [];

  const [entries] = await db.query(
    `SELECT id, action, summary,
            admin_id AS adminId, admin_name AS adminName, admin_email AS adminEmail,
            created_at AS createdAt
       FROM audit_log ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [count] = await db.query(`SELECT COUNT(*) AS total FROM audit_log ${where}`, params);
  return { entries, total: count[0].total };
}

module.exports = { create, findPage };
