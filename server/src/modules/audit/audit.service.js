const audit = require('./audit.repository');

// NFR-16: records an administrator action with who did it; the time is set by MySQL.
// admin is req.user ({ id, name, email }). Called after the action has succeeded.
async function record(admin, action, summary) {
  await audit.create({
    adminId: admin.id,
    adminName: admin.name,
    adminEmail: admin.email,
    action,
    summary,
  });
}

async function list({ action, page, pageSize }) {
  const { entries, total } = await audit.findPage({ action, limit: pageSize, offset: (page - 1) * pageSize });
  return { entries, page, pageSize, total };
}

module.exports = { record, list };
