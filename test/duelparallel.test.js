'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, answerFor } = require('./helpers');

async function playGame(app, call, gameId) {
  for (let i = 0; i < 7; i++) {
    await call(`/api/game/${gameId}/reveal`, {});
    await call(`/api/game/${gameId}/answer`, { text: answerFor(app.db, gameId, 1) });
  }
}

test('duels : 5 duels en parallèle au maximum, et revanche possible dès que le duel est chez le contremaître', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    const others = [];
    for (const name of ['eve', 'lou', 'max', 'zoe', 'ian', 'ada']) {
      const c = client(app.base);
      await c('/api/signup', { username: name, password: 'secret123' });
      others.push({ name, call: c });
    }
    const ids = [];
    for (const { name } of others.slice(0, 5)) {
      const res = await adam('/api/duels', { opponent: name, mode: 'standard' });
      assert.equal(res.status, 200, `duel contre ${name}`);
      ids.push(res.data.duelId || null);
    }
    const sixth = await adam('/api/duels', { opponent: 'ada', mode: 'standard' });
    assert.equal(sixth.status, 409, 'le sixième duel en parallèle est refusé');
    assert.match(sixth.data.error || sixth.data.message || '', /5 duels/);

    // Eve relève le défi et les deux jouent : le duel passe chez le contremaître.
    const eve = others[0].call;
    const open = app.db.prepare("SELECT id, challenger_game_id FROM duels WHERE opponent_id = (SELECT id FROM users WHERE username_key = 'eve')").get();
    await playGame(app, adam, open.challenger_game_id);
    const accepted = (await eve(`/api/duels/${open.id}/accept`, {})).data;
    await playGame(app, eve, accepted.id);
    assert.equal((await adam('/api/duels')).data.checking.length, 1);
    // Un duel terminé n'occupe plus de place : on peut défier un sixième joueur…
    assert.equal((await adam('/api/duels', { opponent: 'ada', mode: 'standard' })).status, 200);
    // … et affronter de nouveau Eve alors que le premier duel est encore en vérification.
    const again = await adam('/api/duels', { opponent: 'eve', mode: 'standard' });
    assert.equal(again.status, 409, 'cinq duels en cours : la limite joue toujours');
  } finally {
    await app.close();
  }
});

test('duels : revanche immédiate contre le même joueur quand le duel est chez le contremaître', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base);
    const eve = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    const first = (await adam('/api/duels', { opponent: 'eve', mode: 'standard' })).data;
    assert.equal((await adam('/api/duels', { opponent: 'eve', mode: 'standard' })).status, 409, 'un seul duel ouvert par paire');
    await playGame(app, adam, first.id);
    const row = app.db.prepare('SELECT id FROM duels').get();
    const accepted = (await eve(`/api/duels/${row.id}/accept`, {})).data;
    await playGame(app, eve, accepted.id);
    assert.equal((await adam('/api/duels')).data.checking.length, 1, 'en vérification chez le contremaître');
    assert.equal((await adam('/api/duels', { opponent: 'eve', mode: 'standard' })).status, 200, 'revanche possible tout de suite');
  } finally {
    await app.close();
  }
});
