const { HttpError } = require('../../errors');
const history = require('./history.repository');
const users = require('../users/users.repository');

// FR-11 / UC-11: one page of a user's completed sessions, newest first, plus totals.
async function historyFor(userId, { page, pageSize }) {
  const { total, totalFee } = await history.summarise(userId);
  const sessions = await history.findCompleted(userId, { limit: pageSize, offset: (page - 1) * pageSize });

  return {
    sessions,
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    totalFee,
  };
}

// A driver sees their own history.
async function ownHistory(user, paging) {
  return historyFor(user.id, paging);
}

// IT-11_05: an administrator sees any user's history.
async function historyOfUser(userId, paging) {
  const user = await users.findById(userId);
  if (!user) throw new HttpError(404, 'User not found');
  return { user: { id: user.id, name: user.name, email: user.email, role: user.role }, ...(await historyFor(userId, paging)) };
}

module.exports = { ownHistory, historyOfUser };