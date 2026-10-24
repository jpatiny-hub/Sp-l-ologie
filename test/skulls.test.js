'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, answerFor } = require('./helpers');

const HALLOWEEN = Date.UTC(2026, 9, 31, 10, 0);

async function playAll(app, call, gameId) {
  const last = [];
  for (let i = 0; i < 7; i++) {
    await call(`/api/game/${gameId}/reveal`, {});
    last.push((await call(`/api/game/${gameId}/answer`, { text: answerFor(app.db, gameId, 1 + (i % 4)) })).data);
  }
  return last;
}

test('jour de collection : crânes à la place des raretés, collection, badges et apparence', async () => {
  const app = await startServer();
  try {
    app.clock.now = HALLOWEEN;
    const adam = client(app.base);
    const eve = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    assert.equal((await eve('/api/me')).data.skullDay, true);

    // Forage du jour : un crâne par réponse, les noms de rareté deviennent des noms de crânes.
    const daily = (await eve('/api/game/start', { mode: 'daily' })).data;
    const answers = await playAll(app, eve, daily.id);
    answers.forEach((a) => assert.match(a.round.tier.label, /^Crâne/));
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM skulls WHERE user_id = 2').get().n, 7);
    let profile = (await eve('/api/profile')).data;
    assert.equal(profile.skulls.total, 7);
    assert.equal(profile.skulls.active, true);
    assert.equal(profile.skulls.complete, false);

    // Mode illimité : ses crânes comptent aussi, et restent quand la partie est effacée.
    for (let g = 0; g < 3; g++) {
      const training = (await eve('/api/game/start', { mode: 'training' })).data;
      await playAll(app, eve, training.id);
    }
    profile = (await eve('/api/profile')).data;
    assert.equal(profile.skulls.total, 28);
    assert.ok(profile.badges.find((b) => b.id === 'cranes-25' && b.count), 'badge Collectionneur de crânes à 25');

    // Duel : les crânes d'adam n'apparaissent dans sa collection qu'à la fin du duel.
    const duel = (await adam('/api/duels', { opponent: 'eve', mode: 'standard' })).data;
    await playAll(app, adam, duel.id);
    assert.equal((await adam('/api/profile')).data.skulls.total, 0, 'crânes cachés tant que le duel est en cours');
    const accepted = (await eve(`/api/duels/${duel.duel.id}/accept`, {})).data;
    await playAll(app, eve, accepted.id);
    assert.equal((await adam('/api/profile')).data.skulls.total, 7, 'crânes visibles une fois le duel terminé');

    // Les cinq qualités réunies : badge « Ossuaire complet » et apparence « Jack-o'-lantern ».
    ['evident', 'courant', 'original', 'rare', 'pepite'].forEach((tier, i) => {
      app.db.prepare("INSERT OR REPLACE INTO skulls (game_id, slot, user_id, day, tier, mode, duel_id) VALUES (?, ?, 2, '2026-10-31', ?, 'training', NULL)").run(9000 + i, 0, tier);
    });
    const another = (await eve('/api/game/start', { mode: 'training' })).data;
    await eve(`/api/game/${another.id}/reveal`, {});
    await eve(`/api/game/${another.id}/answer`, { text: answerFor(app.db, another.id, 1) });
    profile = (await eve('/api/profile')).data;
    assert.equal(profile.skulls.complete, true);
    assert.ok(profile.badges.find((b) => b.id === 'cranes-complet' && b.count));
    assert.equal(profile.bodies.find((b) => b.id === 'jack-o-lantern').unlocked, true);
  } finally {
    await app.close();
  }
});

test('hors jour de collection : aucun crâne et noms de rareté habituels', async () => {
  const app = await startServer();
  try {
    const eve = client(app.base);
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    assert.equal((await eve('/api/me')).data.skullDay, false);
    const game = (await eve('/api/game/start', { mode: 'daily' })).data;
    const answers = await playAll(app, eve, game.id);
    answers.forEach((a) => assert.doesNotMatch(a.round.tier.label, /Crâne/));
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM skulls').get().n, 0);
    assert.equal((await eve('/api/profile')).data.skulls.total, 0);
  } finally {
    await app.close();
  }
});
