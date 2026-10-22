'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { openDb } = require('../src/db');

test('une ancienne base accepte les parties de duel sans perdre ses données', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spl-db-'));
  const file = path.join(dir, 'old.sqlite');
  const old = new DatabaseSync(file);
  old.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, username_key TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, recovery_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE games (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mode        TEXT NOT NULL CHECK (mode IN ('daily', 'training')),
      day         TEXT NOT NULL,
      score       INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      finished_at INTEGER
    );
    CREATE UNIQUE INDEX games_one_daily ON games(user_id, day) WHERE mode = 'daily';
    CREATE INDEX games_by_day ON games(mode, day);
    CREATE TABLE rounds (
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE, slot INTEGER NOT NULL, theme_id TEXT NOT NULL,
      PRIMARY KEY (game_id, slot)
    );
    ALTER TABLE games ADD COLUMN joker_used INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE games ADD COLUMN spare_theme TEXT;
    INSERT INTO users (username, username_key, password_hash, recovery_hash, created_at) VALUES ('adam', 'adam', 'x', 'y', 1);
    INSERT INTO games (user_id, mode, day, score, created_at, finished_at, joker_used, spare_theme) VALUES (1, 'daily', '2026-10-20', 250, 1, 2, 1, 'abc');
    INSERT INTO rounds (game_id, slot, theme_id) VALUES (1, 0, 'villes');
  `);
  old.close();

  const db = openDb(file);
  const game = db.prepare('SELECT * FROM games WHERE id = 1').get();
  assert.equal(game.score, 250);
  assert.equal(game.joker_used, 1);
  assert.equal(game.spare_theme, 'abc');
  assert.equal(game.no_timer, 0, 'nouvelle colonne ajoutée');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM rounds').get().n, 1, 'les manches suivent');
  db.prepare("INSERT INTO games (user_id, mode, day, created_at, duel_id) VALUES (1, 'duel', '2026-10-21', 3, 7)").run();
  assert.throws(() => db.prepare("INSERT INTO games (user_id, mode, day, created_at) VALUES (1, 'autre', '2026-10-21', 3)").run(), /CHECK/);
  assert.throws(() => db.prepare("INSERT INTO games (user_id, mode, day, created_at) VALUES (1, 'daily', '2026-10-20', 3)").run(), /UNIQUE/, 'un seul forage du jour par joueur');
  assert.throws(() => db.prepare('INSERT INTO rounds (game_id, slot, theme_id) VALUES (999, 0, ?)').run('x'), /FOREIGN/, 'clés étrangères actives');
  db.prepare('DELETE FROM games WHERE id = 1').run();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM rounds').get().n, 0, 'la suppression en cascade fonctionne');
  // Réouverture : rien à refaire.
  db.close();
  const again = openDb(file);
  assert.equal(again.prepare("SELECT COUNT(*) AS n FROM games WHERE mode = 'duel'").get().n, 1);
  again.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
