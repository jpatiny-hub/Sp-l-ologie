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
  // Interface d'écoute (toutes par défaut ; 127.0.0.1 derrière un proxy).
  HOST: process.env.HOST || undefined,
  // En-tête donnant l'adresse du visiteur, posé par un proxy de confiance (ex. cf-connecting-ip).
  CLIENT_IP_HEADER: (process.env.CLIENT_IP_HEADER || '').trim().toLowerCase() || null,
  // Identifiants (séparés par des virgules) qui voient les réponses signalées par les joueurs.
  // Sans réglage, c'est le premier compte créé.
  ADMIN_USERS: (process.env.ADMIN_USERS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  DATA_DIR: process.env.DATA_DIR || path.join(ROOT, 'var'),
  THEMES_DIR: process.env.THEMES_DIR || path.join(ROOT, 'data', 'themes'),
  PUBLIC_DIR: path.join(ROOT, 'public'),
};
