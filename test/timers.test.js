'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, answerFor } = require('./helpers');

test('infini : chrono de 15 ou 60 secondes au choix, le forage du jour reste à 30', async () => {
  const app = await startServer();
  try {
    const eve = client(app.base);
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    const daily = (await eve('/api/game/start', { mode: 'daily' })).data;
    assert.equal(daily.timerSeconds, 30);
    const fast = (await eve('/api/game/start', { mode: 'training', timerSec: 15 })).data;
    assert.equal(fast.timerSeconds, 15);
    await eve(`/api/game/${fast.id}/reveal`, {});
    app.clock.now += 16 * 1000 + 3000;
    const late = (await eve(`/api/game/${fast.id}/answer`, { text: answerFor(app.db, fast.id, 1) })).data;
    assert.equal(late.result, 'timeout', 'le chrono de 15 secondes est dépassé');
    const long = (await eve('/api/game/start', { mode: 'training', timerSec: 60 })).data;
    assert.equal(long.timerSeconds, 60);
    await eve(`/api/game/${long.id}/reveal`, {});
    app.clock.now += 40 * 1000;
    const ok = (await eve(`/api/game/${long.id}/answer`, { text: answerFor(app.db, long.id, 1) })).data;
    assert.notEqual(ok.result, 'timeout', 'à 40 secondes on est encore dans les 60');
    const odd = (await eve('/api/game/start', { mode: 'training', timerSec: 7 })).data;
    assert.equal(odd.timerSeconds, 30, 'une durée inconnue retombe sur 30 secondes');
  } finally {
    await app.close();
  }
});

test('duel : modes éclair (15 s) et long (60 s), identiques pour les deux joueurs', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base);
    const eve = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    const started = (await adam('/api/duels', { opponent: 'eve', mode: 'eclair' })).data;
    assert.equal(started.timerSeconds, 15);
    assert.equal(started.noTimer, false);
    for (let i = 0; i < 7; i++) {
      await adam(`/api/game/${started.id}/reveal`, {});
      await adam(`/api/game/${started.id}/answer`, { text: answerFor(app.db, started.id, 1) });
    }
    const joined = (await eve(`/api/duels/${started.duel.id}/accept`, {})).data;
    assert.equal(joined.timerSeconds, 15, 'l\'adversaire joue avec le même chrono');
    const thread = (await eve('/api/messages/thread?with=Le%20Contremaître')).data;
    assert.match(thread.messages[0].body, /éclair, 15 secondes/);
    assert.equal((await adam('/api/duels', { opponent: 'eve', mode: 'bizarre' })).status, 400);
  } finally {
    await app.close();
  }
});
