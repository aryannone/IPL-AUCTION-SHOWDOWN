const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth.routes');
const playersRoutes = require('./routes/players.routes');
const adminRoutes = require('./routes/admin.routes');
const gamesRoutesFactory = require('./routes/games.routes');

function createApp(gameManager) {
  const app = express();

  const allowedOrigin = process.env.FRONTEND_URL || '*';
  app.use(cors({ origin: allowedOrigin, credentials: true }));
  app.use(express.json());

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api', apiLimiter);

  app.get('/health', (req, res) => res.json({ ok: true, service: "PARADOX '26 backend" }));

  app.use('/api/auth', authRoutes);
  app.use('/api/players', playersRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/games', gamesRoutesFactory(gameManager));

  // 404
  app.use((req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'Route not found.' }));

  // error handler - never leak stack traces
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Something went wrong.' });
  });

  return app;
}

module.exports = { createApp };
