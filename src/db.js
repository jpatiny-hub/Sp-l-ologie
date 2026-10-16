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
`;

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
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
