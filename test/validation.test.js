'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client } = require('./helpers');

test('duels : validés le lendemain à 2 h 30, badges attribués seulement alors', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base);
    const eve = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    const finished = app.clock.now; // mercredi 14 octobre, midi à Bruxelles
    app.db
      .prepare("INSERT INTO duels (challenger_id, opponent_id, mode, status, created_at, expires_at, finished_at, winner_id, challenger_score, opponent_score) VALUES (1, 2, 'standard', 'done', 1, 9, ?, 1, 500, 300)")
      .run(finished);
    const validated = () => app.db.prepare('SELECT validated_at FROM duels').get().validated_at;
    const badges = (id) => app.db.prepare('SELECT kind FROM badges WHERE user_id = ?').all(id).map((r) => r.kind);

    await adam('/api/duels');
    assert.equal(validated(), null, 'le jour même : pas encore validé');
    assert.ok(!badges(2).includes('defenseur-1'));

    app.clock.now = Date.UTC(2026, 9, 15, 0, 15); // jeudi 02:15 à Bruxelles
    await adam('/api/duels');
    assert.equal(validated(), null, 'avant 2 h 30 : pas encore validé');

    app.clock.now = Date.UTC(2026, 9, 15, 0, 35); // jeudi 02:35
    await eve('/api/duels');
    assert.notEqual(validated(), null, 'après 2 h 30 : validé');
    assert.ok(badges(2).includes('defenseur-1'));
  } finally {
    await app.close();
  }
});
