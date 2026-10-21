const express = require('express');
const cookieParser = require('cookie-parser');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const usersRoutes = require('./modules/users/users.routes');

const app = express();

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', usersRoutes);

app.use('/api', notFound);
app.use(errorHandler);

module.exports = app;
