'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client } = require('./helpers');

test('essai d\'un thème : réservé au responsable, reconnaissance, points et plus proches réponses', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base);
    const eve = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    assert.equal((await eve('/api/admin/theme-test')).status, 403);
    assert.equal((await eve('/api/admin/theme-test', { themeId: 'x', inputs: [] })).status, 403);
    const themes = (await adam('/api/admin/theme-test')).data.themes;
    assert.ok(themes.some((t) => t.id === 'infractions-code-route'));
    const { results } = (await adam('/api/admin/theme-test', { themeId: 'infractions-code-route', inputs: ['Rouler à contre-sens', 'Excès de vitesse', 'zzzzqqqq', ''] })).data;
    assert.equal(results.length, 3);
    assert.equal(results[0].found, true);
    assert.equal(results[0].label, 'Circulation en sens inverse');
    assert.equal(results[0].confirm, true);
    assert.equal(results[1].via, 'nom exact');
    assert.ok(results[0].points > results[1].points, 'une réponse moins évidente rapporte plus');
    assert.equal(results[1].given, 0);
    assert.equal(results[2].found, false);
    assert.equal(results[2].near.length, 3);
    assert.equal((await adam('/api/admin/theme-test', { themeId: 'inconnu', inputs: ['a'] })).status, 404);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM answer_counts').get().n, 0, 'rien n\'est enregistré');
  } finally {
    await app.close();
  }
});
