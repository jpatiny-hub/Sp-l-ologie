'use strict';

const path = require('node:path');

const ROOT = path.join(__dirname, '..');

module.exports = {
  GAME_NAME: 'Spéléologie',
  // Les journées et les semaines sont calculées à l'heure belge.
  TIMEZONE: 'Europe/Brussels',
  ROUNDS_PER_GAME: 7,
  // Durée pour répondre à un thème (peut être réduite plus tard).
  TIMER_SECONDS: Number(process.env.TIMER_SECONDS) || 30,
  // Marge côté serveur pour absorber la latence réseau.
  TIMER_GRACE_MS: 2500,
  SESSION_DAYS: 90,
  PORT: Number(process.env.PORT) || 3000,
  DATA_DIR: process.env.DATA_DIR || path.join(ROOT, 'var'),
  THEMES_DIR: process.env.THEMES_DIR || path.join(ROOT, 'data', 'themes'),
  PUBLIC_DIR: path.join(ROOT, 'public'),
};
