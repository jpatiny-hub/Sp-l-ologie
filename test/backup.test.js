'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDb } = require('../src/db');
const { runBackup } = require('../src/backup');

test('sauvegarde : une copie lisible par jour, rotation au-delà de sept jours', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spl-bak-'));
  const db = openDb(path.join(dir, 'speleologie.sqlite'));
  db.prepare("INSERT INTO users (username, username_key, password_hash, recovery_hash, created_at) VALUES ('adam', 'adam', 'x', 'y', 1)").run();
  let now = Date.UTC(2026, 9, 20, 10, 0);
  const clock = () => now;
  const made = runBackup(db, { now: clock, keep: 3 });
  assert.ok(made && fs.existsSync(made));
  assert.equal(runBackup(db, { now: clock, keep: 3 }), null, 'une seule sauvegarde par jour');
  // La copie contient bien les données.
  const copy = openDb(made);
  assert.equal(copy.prepare('SELECT username FROM users').get().username, 'adam');
  copy.close();
  // Les jours suivants : les plus anciennes disparaissent.
  for (let d = 21; d <= 25; d++) {
    now = Date.UTC(2026, 9, d, 10, 0);
    runBackup(db, { now: clock, keep: 3 });
  }
  const left = fs.readdirSync(path.join(dir, 'backups')).sort();
  assert.deepEqual(left, ['speleologie-2026-10-23.sqlite', 'speleologie-2026-10-24.sqlite', 'speleologie-2026-10-25.sqlite']);
  db.close();
  assert.equal(runBackup(openDb(':memory:')), null, 'pas de sauvegarde pour une base en mémoire');
  fs.rmSync(dir, { recursive: true, force: true });
});
