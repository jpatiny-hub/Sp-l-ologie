'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, playDaily } = require('./helpers');

test('récap du lundi : proposé une seule fois, avec le podium de la semaine écoulée', async () => {
  const app = await startServer();
  try {
    // Semaine du lundi 19 octobre 2026 : trois joueurs.
    app.clock.now = Date.UTC(2026, 9, 20, 10, 0);
    const adam = client(app.base);
    const eve = client(app.base);
    const jose = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    await jose('/api/signup', { username: 'jose', password: 'secret123' });
    await playDaily(app, adam, 3);
    await playDaily(app, eve, 1);
    assert.equal((await adam('/api/me')).data.recap, null, 'rien tant que la semaine n\'est pas terminée');

    app.clock.now = Date.UTC(2026, 9, 26, 10, 0); // lundi 26
    const me = (await adam('/api/me')).data;
    assert.equal(me.recap, '2026-10-19');
    const recap = (await adam('/api/recap?week=2026-10-19')).data;
    assert.equal(recap.players, 2);
    assert.equal(recap.entries.length, 2);
    assert.equal(recap.champion.rank, 1);
    assert.equal(recap.games, 2);
    assert.equal(recap.me.rank, recap.entries.find((e) => e.me).rank);
    assert.ok(recap.best && recap.best.score > 0);
    assert.ok(recap.rarest && recap.rarest.answer);
    assert.equal((await adam('/api/recap?week=2026-10-26')).status, 400, 'la semaine en cours n\'a pas de récap');

    // Jose, inscrit avant la fin de la semaine mais sans forage, le voit aussi ; une fois vu, il ne revient plus.
    assert.equal((await jose('/api/me')).data.recap, '2026-10-19');
    await jose('/api/recap/seen', { week: '2026-10-19' });
    assert.equal((await jose('/api/me')).data.recap, null);
    assert.equal((await adam('/api/me')).data.recap, '2026-10-19', 'chacun son tour');

    // Un joueur inscrit pendant la semaine en cours n'a rien à voir.
    const late = client(app.base);
    await late('/api/signup', { username: 'late', password: 'secret123' });
    assert.equal((await late('/api/me')).data.recap, null);
  } finally {
    await app.close();
  }
});
