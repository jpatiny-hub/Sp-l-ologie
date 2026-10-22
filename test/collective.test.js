'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, playDaily } = require('./helpers');
const { collectiveStatus, GOAL } = require('../src/collective');

test('défi collectif : rien avant la première édition, puis les points de tous les joueurs s\'additionnent', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base);
    const eve = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    assert.equal((await adam('/api/me')).data.collective, null, 'pas de défi avant le 23 octobre');

    app.clock.now = Date.UTC(2026, 9, 24, 10, 0);
    const a = await playDaily(app, adam, 1);
    let me = (await adam('/api/me')).data.collective;
    assert.equal(me.total, a.score);
    assert.equal(me.goal, GOAL);
    assert.equal(me.reached, false);
    assert.equal(me.players.length, 1);
    const e = await playDaily(app, eve, 3);
    me = (await adam('/api/me')).data.collective;
    assert.equal(me.total, a.score + e.score);
    assert.equal(me.players.length, 2);
    assert.equal(me.players.filter((p) => p.me).length, 1);
    assert.equal(me.daysLeft, 8, 'du 24 au 31 octobre, jour courant compris');
    assert.equal(me.players[0].points >= me.players[1].points, true, 'le plus gros contributeur d\'abord');
  } finally {
    await app.close();
  }
});

test('défi collectif : objectif atteint, jour d\'arrivée repéré', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    const userId = app.db.prepare('SELECT id FROM users').get().id;
    const insert = app.db.prepare("INSERT INTO games (user_id, mode, day, score, created_at, finished_at) VALUES (?, 'daily', ?, ?, 0, 1)");
    // Un seul joueur ne peut avoir qu'un forage par jour : 10 000 points sur plusieurs jours fictifs.
    for (let d = 23; d <= 31; d++) insert.run(userId, `2026-10-${d}`, 1200);
    const status = collectiveStatus(app.db, '2026-10-31', userId);
    assert.equal(status.total, 10800);
    assert.equal(status.reached, true);
    assert.equal(status.reachedOn, '2026-10-31', 'le total passe 10 000 le 31 (9e jour)');
  } finally {
    await app.close();
  }
});
