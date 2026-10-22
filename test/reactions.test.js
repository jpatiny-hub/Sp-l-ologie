'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, playDaily } = require('./helpers');

test('réactions : une par réponse, remplaçable, pas sur sa propre réponse', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base);
    const eve = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    // Avant d'avoir terminé son forage, on ne peut pas réagir.
    await playDaily(app, eve);
    const early = (await eve('/api/compare?date=2026-10-14')).data;
    const adamRoundEarly = early.players.find((p) => !p.me);
    assert.equal(adamRoundEarly, undefined, 'seule Eve a joué');
    await playDaily(app, adam);

    const data = (await adam('/api/compare?date=2026-10-14')).data;
    const mine = data.players.find((p) => p.me).rounds[0];
    const evesRound = data.players.find((p) => !p.me).rounds[0];
    assert.ok(evesRound.rid, 'chaque réponse porte un identifiant de réaction');
    assert.equal((await adam('/api/reactions', { rid: mine.rid, kind: 'bienvu' })).status, 403, 'pas sur sa propre réponse');
    assert.equal((await adam('/api/reactions', { rid: evesRound.rid, kind: 'inconnue' })).status, 400);

    let res = await adam('/api/reactions', { rid: evesRound.rid, kind: 'bienvu' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.data.reactions, { bienvu: 1 });
    res = await adam('/api/reactions', { rid: evesRound.rid, kind: 'coeur' });
    assert.deepEqual(res.data.reactions, { coeur: 1 }, 'une nouvelle réaction remplace la précédente');
    const after = (await eve('/api/compare?date=2026-10-14')).data;
    const seen = after.players.find((p) => p.me).rounds[0];
    assert.deepEqual(seen.reactions, { coeur: 1 }, 'Eve voit la réaction reçue');
    const adamView = (await adam('/api/compare?date=2026-10-14')).data.players.find((p) => !p.me).rounds[0];
    assert.equal(adamView.mine, 'coeur');
    res = await adam('/api/reactions', { rid: evesRound.rid, kind: null });
    assert.deepEqual(res.data.reactions, {}, 'réaction retirée');
  } finally {
    await app.close();
  }
});
