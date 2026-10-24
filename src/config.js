'use strict';

const path = require('node:path');

const ROOT = path.join(__dirname, '..');

module.exports = {
  GAME_NAME: 'Spéléologie',
  // Les journées et les semaines sont calculées à l'heure belge.
  TIMEZONE: 'Europe/Brussels',
  // Heure (belge) à laquelle un nouveau jour de jeu, avec ses nouveaux thèmes, commence.
  DAY_START_HOUR: 2,
  ROUNDS_PER_GAME: 7,
  // Durée pour répondre à un thème (peut être réduite plus tard).
  TIMER_SECONDS: Number(process.env.TIMER_SECONDS) || 30,
  // Marge côté serveur pour absorber la latence réseau.
  TIMER_GRACE_MS: 2500,
  SESSION_DAYS: 90,
  // Étais de galerie (gels de série) : un jour manqué n'est pardonné que s'il tombe à cette date ou après.
  FREEZE_FROM: process.env.FREEZE_FROM || '2026-10-21',
  // Décors de saison (interface et scène de forage) : actifs du jour de jeu `from` au jour `to` inclus (le jour change à 2 h).
  // Halloween : dès le nouveau jour du 24 octobre (2 h) jusqu'au changement de jour du 31 octobre au 1er novembre ; Toussaint : le 1er novembre.
  SEASONS: [
    { id: 'halloween', from: '2026-10-24', to: '2026-10-31' },
    { id: 'toussaint', from: '2026-11-01', to: '2026-11-01' },
  ],
  // Jours aux thèmes imposés (par exemple Halloween) : voir data/special-days.json.
  // Jours de collection de crânes : les raretés deviennent des crânes et chaque réponse enrichit la collection du joueur.
  SKULL_DAYS: ['2026-10-31'],
  SPECIAL_DAYS_FILE: path.join(ROOT, 'data', 'special-days.json'),
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
