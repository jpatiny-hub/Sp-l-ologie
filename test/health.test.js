'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startServer, client } = require('./helpers');
const { openDb } = require('../src/db');
const { runBackup, backupNow, snapshotBeforeStart, listBackups, verifyBackup } = require('../src/backup');
const { ErrorLog } = require('../src/health');

test('journal des erreurs : rafales regroupées, tri récent, nettoyage', () => {
  const db = openDb(':memory:');
  let now = 1_000_000;
  const log = new ErrorLog(db, () => now);
  assert.equal(log.record('serveur', 'boum', { path: 'GET /api/x' }), true);
  assert.equal(log.record('serveur', 'boum', { path: 'GET /api/x' }), false, 'même erreur à la suite : comptée une fois');
  now += 61_000;
  assert.equal(log.record('serveur', 'boum', { path: 'GET /api/x' }), true);
  log.record('navigateur', 'autre');
  assert.deepEqual(log.recent().map((e) => e.message), ['autre', 'boum', 'boum']);
  assert.deepEqual(log.since(1_000_000).map((x) => x.kind).sort(), ['navigateur', 'serveur']);
  log.record('inconnu', 'x'.repeat(1000));
  assert.equal(log.recent(1)[0].message.length, 300);
  assert.equal(log.recent(1)[0].kind, 'serveur');
  log.clear();
  assert.equal(log.recent().length, 0);
});

test('sauvegardes : copies contrôlées, avant démarrage limitée dans le temps, manuelle, liste', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spl-health-'));
  const file = path.join(dir, 'speleologie.sqlite');
  const db = openDb(file);
  db.prepare("INSERT INTO users (username, username_key, password_hash, recovery_hash, created_at) VALUES ('adam', 'adam', 'x', 'y', 1)").run();
  let now = Date.UTC(2026, 9, 27, 10, 0);
  const clock = () => now;
  const daily = runBackup(db, { now: clock });
  assert.ok(verifyBackup(daily));
  const start = snapshotBeforeStart(file, { now: clock });
  assert.ok(start && /demarrage-20261027T100000Z/.test(start));
  assert.equal(snapshotBeforeStart(file, { now: clock }), null, 'pas de deuxième copie avant démarrage dans les dix minutes');
  const manual = backupNow(db, { now: () => now + 5000 });
  assert.ok(/manuelle-20261027T100005Z/.test(manual));
  const copy = openDb(start);
  assert.equal(copy.prepare('SELECT username FROM users').get().username, 'adam');
  copy.close();
  const kinds = listBackups(db).map((b) => b.kind).sort();
  assert.deepEqual(kinds, ['avant démarrage', 'manuelle', 'quotidienne']);
  // Une copie illisible est détectée.
  const bad = path.join(dir, 'mauvaise.sqlite');
  fs.writeFileSync(bad, 'pas une base');
  assert.throws(() => verifyBackup(bad));
  db.close();
  assert.equal(snapshotBeforeStart(':memory:'), null);
  assert.equal(snapshotBeforeStart(path.join(dir, 'absente.sqlite')), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('santé : réservée au responsable, erreurs du navigateur remontées, journal vidé', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base);
    const eve = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    assert.equal((await eve('/api/admin/health')).status, 403);
    assert.equal((await eve('/api/client-error', { message: 'x is not a function', detail: 'at app.js:1', view: 'game' })).status, 200);
    const health = (await adam('/api/admin/health')).data;
    assert.equal(health.database.integrity, 'ok');
    assert.equal(health.totals.users, 2);
    assert.equal(health.errors.recent[0].kind, 'navigateur');
    assert.equal(health.errors.recent[0].message, 'x is not a function');
    assert.ok(health.problems.some((p) => /sauvegarde/i.test(p)), 'base en mémoire : aucune sauvegarde');
    assert.equal((await eve('/api/admin/errors/clear', {})).status, 403);
    await adam('/api/admin/errors/clear', {});
    assert.equal((await adam('/api/admin/health')).data.errors.recent.length, 0);
    // Une erreur interne est notée dans le journal.
    app.db.exec('DROP TABLE reactions');
    const res = await eve('/api/reactions', { themeId: 'x', answerKey: 'y', day: '2026-10-14', username: 'adam', emoji: '👍' });
    if (res.status === 500) assert.equal((await adam('/api/admin/health')).data.errors.recent[0].kind, 'serveur');
  } finally {
    await app.close();
  }
});

test('retours précis sur une réponse refusée : réservés au responsable, sans nommer la bonne réponse', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base);
    const eve = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    const play = async (c) => {
      const game = (await c('/api/game/start', { mode: 'training' })).data;
      await c(`/api/game/${game.id}/reveal`, {});
      return game;
    };
    const g1 = await play(adam);
    const g2 = await play(eve);
    const refused = await adam(`/api/game/${g1.id}/answer`, { text: 'zz' });
    assert.equal(refused.data.result, 'unknown');
    assert.equal(refused.data.hint.kind, 'court');
    const none = await adam(`/api/game/${g1.id}/answer`, { text: 'qqqqwwwweeee' });
    assert.equal(none.data.hint.kind, 'aucune');
    const other = await eve(`/api/game/${g2.id}/answer`, { text: 'qqqqwwwweeee' });
    assert.equal(other.data.result, 'unknown');
    assert.equal(other.data.hint, undefined, 'les autres joueurs ne voient pas les retours précis');
  } finally {
    await app.close();
  }
});
