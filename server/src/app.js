const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const usersRoutes = require('./modules/users/users.routes');
const vehiclesRoutes = require('./modules/users/vehicles/vehicles.routes');

const CLIENT_DIST = path.join(__dirname, '..', '..', 'client', 'dist');

const app = express();

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', usersRoutes);
app.use('/api/vehicles', vehiclesRoutes);

app.use('/api', notFound);


// Serve the built web client (npm run build) and let React Router handle its paths.
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('/{*path}', (req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

app.use(errorHandler);

module.exports = app;
