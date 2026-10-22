'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, playDaily } = require('./helpers');

test('musée des pépites : les pépites du jour restent cachées jusqu\'au lendemain', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base);
    const eve = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    const state = await playDaily(app, adam, 5);
    const pepites = state.rounds.filter((r) => r.tier && r.tier.id === 'pepite').length;
    assert.ok(pepites > 0, 'des réponses rares du premier joueur sont des pépites');
    let m = (await eve('/api/museum')).data;
    assert.equal(m.total, 0, 'pas de pépite visible le jour même');
    assert.equal(m.todayCount, pepites);
    app.clock.now += 24 * 3600 * 1000;
    m = (await eve('/api/museum')).data;
    assert.equal(m.total, pepites);
    assert.equal(m.entries.length, pepites);
    assert.equal(m.players[0].username, 'adam');
    assert.equal(m.players[0].count, pepites);
    assert.ok(m.entries[0].answer && m.entries[0].theme);
    assert.equal(m.entries[0].me, false);
  } finally {
    await app.close();
  }
});

test('fil de nouvelles : événements récents, pépites annoncées sans dire laquelle', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await playDaily(app, adam, 5);
    const { events } = (await adam('/api/feed?limit=10')).data;
    assert.ok(events.length >= 2);
    assert.ok(events.every((e, i) => i === 0 || events[i - 1].ts >= e.ts), 'du plus récent au plus ancien');
    const pepite = events.find((e) => e.type === 'pepite');
    assert.ok(pepite && /pépite/.test(pepite.text));
    assert.equal(events.find((e) => e.type === 'badge') !== undefined, true, 'un badge de profondeur ou de pépite apparaît');
    assert.equal((await adam('/api/feed')).data.events.length <= 3, true, 'trois événements par défaut');
  } finally {
    await app.close();
  }
});
