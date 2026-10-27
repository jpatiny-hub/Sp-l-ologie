'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, playDaily } = require('./helpers');

const DAY = 24 * 3600 * 1000;

test('journal de la mine : dernières nouvelles, ou un jour précis au choix', async () => {
  const app = await startServer();
  try {
    const eve = client(app.base);
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    app.clock.now = Date.UTC(2026, 9, 24, 10, 0);
    for (let i = 0; i < 3; i++) {
      await playDaily(app, eve, 2);
      app.clock.now += DAY;
    }
    const all = (await eve('/api/feed?limit=60')).data;
    assert.equal(all.date, null);
    assert.ok(all.events.length >= 2);
    assert.equal((await eve('/api/feed?limit=1')).data.events.length, 1);

    const one = (await eve('/api/feed?limit=60&date=2026-10-24')).data;
    assert.equal(one.date, '2026-10-24');
    assert.ok(one.events.length > 0 && one.events.length < all.events.length, 'seulement ce jour-là');
    const empty = (await eve('/api/feed?limit=60&date=2026-01-02')).data;
    assert.deepEqual(empty.events, []);
    // Une date invalide est ignorée : on retombe sur les dernières nouvelles.
    assert.equal((await eve('/api/feed?limit=60&date=nimporte')).data.date, null);
  } finally {
    await app.close();
  }
});
