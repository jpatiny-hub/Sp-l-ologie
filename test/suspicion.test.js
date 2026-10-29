'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, answerFor } = require('./helpers');

test('signaux discrets : collage, page quittée, copie et rapidité remontent au responsable seulement', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base);
    const eve = client(app.base);
    const gus = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    await gus('/api/signup', { username: 'gus', password: 'secret123' });

    assert.equal((await eve('/api/admin/suspicions')).status, 403, 'réservé au responsable');

    // Eve : à chaque thème, collage + copie tentée + longue absence, réponse pépite en moins de 5 s.
    const eg = (await eve('/api/game/start', { mode: 'daily' })).data;
    for (let i = 0; i < 4; i++) {
      await eve(`/api/game/${eg.id}/reveal`, {});
      app.clock.now += 2000;
      const res = await eve(`/api/game/${eg.id}/answer`, { text: answerFor(app.db, eg.id, 5), sig: { p: 1, a: 9000, n: 1, c: 1, e: 1 } });
      assert.equal(res.status, 200);
    }
    // Gus : joue normalement, sans aucun signal.
    const gg = (await gus('/api/game/start', { mode: 'daily' })).data;
    for (let i = 0; i < 3; i++) {
      await gus(`/api/game/${gg.id}/reveal`, {});
      app.clock.now += 12000;
      await gus(`/api/game/${gg.id}/answer`, { text: answerFor(app.db, gg.id, 1), sig: { p: 0, a: 0, n: 0, c: 0, e: 9 } });
    }

    const report = (await adam('/api/admin/suspicions')).data;
    const eveRow = report.players.find((p) => p.username === 'eve');
    const gusRow = report.players.find((p) => p.username === 'gus');
    assert.equal(report.players[0].username, 'eve', 'le plus marqué en premier');
    assert.equal(eveRow.rounds, 4);
    assert.equal(eveRow.pastes, 4);
    assert.equal(eveRow.copies, 4);
    assert.equal(eveRow.away, 4);
    assert.equal(eveRow.level, 'forte');
    assert.ok(eveRow.flagged.length > 0 && eveRow.flagged[0].why.includes('texte collé'));
    assert.equal(gusRow.level, 'rien');
    assert.equal(gusRow.flagged.length, 0);

    // Valeurs absurdes ou absentes : ramenées dans des bornes, sans erreur.
    const g2 = (await adam('/api/game/start', { mode: 'daily' })).data;
    await adam(`/api/game/${g2.id}/reveal`, {});
    assert.equal((await adam(`/api/game/${g2.id}/answer`, { text: answerFor(app.db, g2.id, 1), sig: { p: 'x', a: -5, n: 1e12, c: null } })).status, 200);
    const adamRow = (await adam('/api/admin/suspicions')).data.players.find((p) => p.username === 'adam');
    assert.equal(adamRow.pastes, 0);
    assert.equal(adamRow.away, 0, 'durée négative ramenée à zéro');
    assert.equal(app.db.prepare('SELECT away_n FROM play_signals WHERE game_id = ?').get(g2.id).away_n, 99, 'compteur absurde plafonné');
  } finally {
    await app.close();
  }
});
