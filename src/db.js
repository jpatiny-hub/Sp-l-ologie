'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL,
  username_key  TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  recovery_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Les 7 thèmes du jour, identiques pour tout le monde.
CREATE TABLE IF NOT EXISTS daily_themes (
  day      TEXT NOT NULL,
  slot     INTEGER NOT NULL,
  theme_id TEXT NOT NULL,
  PRIMARY KEY (day, slot)
);

CREATE TABLE IF NOT EXISTS games (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode        TEXT NOT NULL CHECK (mode IN ('daily', 'training')),
  day         TEXT NOT NULL,
  score       INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS games_one_daily ON games(user_id, day) WHERE mode = 'daily';
CREATE INDEX IF NOT EXISTS games_by_day ON games(mode, day);

CREATE TABLE IF NOT EXISTS rounds (
  game_id      INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  slot         INTEGER NOT NULL,
  theme_id     TEXT NOT NULL,
  served_at    INTEGER,
  answered_at  INTEGER,
  input        TEXT,
  answer_key   TEXT,
  answer_label TEXT,
  points       INTEGER,
  outcome      TEXT,
  probability  REAL,
  PRIMARY KEY (game_id, slot)
);

-- Nombre de fois qu'une réponse a été donnée en partie quotidienne (alimente le modèle de rareté).
CREATE TABLE IF NOT EXISTS answer_counts (
  theme_id   TEXT NOT NULL,
  answer_key TEXT NOT NULL,
  n          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (theme_id, answer_key)
);

-- Réponses refusées : à relire pour enrichir les thèmes.
CREATE TABLE IF NOT EXISTS unknown_answers (
  theme_id  TEXT NOT NULL,
  input_key TEXT NOT NULL,
  example   TEXT NOT NULL,
  n         INTEGER NOT NULL DEFAULT 0,
  last_at   INTEGER NOT NULL,
  PRIMARY KEY (theme_id, input_key)
);

-- Badges obtenus. Un même badge peut être gagné plusieurs fois (instance : jour, période, année…).
CREATE TABLE IF NOT EXISTS badges (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  instance   TEXT NOT NULL,
  earned_on  TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  seen_at    INTEGER,
  PRIMARY KEY (user_id, kind, instance)
);

-- Réponses que des joueurs pensent correctes alors qu'elles ont été refusées : à vérifier et ajouter.
CREATE TABLE IF NOT EXISTS answer_reports (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  theme_id   TEXT NOT NULL,
  input_key  TEXT NOT NULL,
  input      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  handled_at INTEGER,
  PRIMARY KEY (user_id, theme_id, input_key)
);

-- Thème de remplacement du jour (le « joker » : le même pour tous les joueurs).
CREATE TABLE IF NOT EXISTS daily_spare (
  day      TEXT PRIMARY KEY,
  theme_id TEXT NOT NULL
);

-- Parties terminées en mode illimité, par jour (pour le défi de la semaine).
CREATE TABLE IF NOT EXISTS training_log (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day     TEXT NOT NULL,
  game_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, game_id)
);

-- Statistiques cumulées du mode illimité (les parties d'entraînement sont effacées à la suivante).
CREATE TABLE IF NOT EXISTS training_stats (
  user_id           INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  games             INTEGER NOT NULL DEFAULT 0,
  themes            INTEGER NOT NULL DEFAULT 0,
  answers           INTEGER NOT NULL DEFAULT 0,
  points            INTEGER NOT NULL DEFAULT 0,
  pepites           INTEGER NOT NULL DEFAULT 0,
  best_round        INTEGER NOT NULL DEFAULT 0,
  best_round_theme  TEXT,
  best_round_answer TEXT,
  best_score        INTEGER NOT NULL DEFAULT 0
);

-- Réponses données en mode illimité : un simple compteur par réponse, sans historique, hors du modèle de rareté du jour.
CREATE TABLE IF NOT EXISTS training_answer_counts (
  theme_id   TEXT NOT NULL,
  answer_key TEXT NOT NULL,
  n          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (theme_id, answer_key)
);

-- Réactions aux réponses des autres dans le comparatif : une par joueur et par réponse (game_id, slot : manche réagie).
CREATE TABLE IF NOT EXISTS reactions (
  game_id    INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  slot       INTEGER NOT NULL,
  reactor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (game_id, slot, reactor_id)
);

-- Thèmes proposés par les joueurs, à examiner par le responsable du jeu.
CREATE TABLE IF NOT EXISTS theme_suggestions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  details    TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  handled_at INTEGER
);
`;

// Colonnes ajoutées après la mise en ligne : créées si la base est plus ancienne.
const MIGRATIONS = [
  ['users', 'skin_body', 'TEXT'],
  ['users', 'skin_bit', 'TEXT'],
  ['users', 'skin_timer', 'TEXT'],
  ['users', 'news_seen', 'INTEGER NOT NULL DEFAULT 0'],
  // Avatar (JSON des choix) et date du dernier changement de pseudo (un changement par semaine).
  ['users', 'avatar', 'TEXT'],
  ['users', 'username_changed_at', 'INTEGER'],
  // Dernière semaine (lundi) dont le récap a été vu.
  ['users', 'recap_seen', 'TEXT'],
  // Joker : un thème à changer gratuitement par partie (thème de remplacement et thème remplacé).
  ['games', 'joker_used', 'INTEGER NOT NULL DEFAULT 0'],
  ['games', 'spare_theme', 'TEXT'],
  ['rounds', 'swapped_from', 'TEXT'],
  // Signalement fait pendant la manche (manche retrouvée par game_id et slot) et suite donnée aux points.
  ['answer_reports', 'game_id', 'INTEGER'],
  ['answer_reports', 'slot', 'INTEGER'],
  ['answer_reports', 'credit', 'TEXT'],
  ['answer_reports', 'points', 'INTEGER'],
  // Retour du responsable au joueur : verdict (accepted / refused), message, et lecture par le joueur.
  ['answer_reports', 'verdict', 'TEXT'],
  ['answer_reports', 'message', 'TEXT'],
  ['answer_reports', 'updated_at', 'INTEGER'],
  ['answer_reports', 'seen_at', 'INTEGER'],
];

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  for (const [table, column, type] of MIGRATIONS) {
    const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
    if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
  return db;
}

/** Exécute `fn` dans une transaction. */
function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { openDb, transaction };
