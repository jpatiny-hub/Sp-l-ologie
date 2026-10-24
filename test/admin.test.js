'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client } = require('./helpers');

test('responsable : drapeau stocké sur le premier compte, mot de passe de 8 caractères pour les nouveaux comptes', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base);
    const eve = client(app.base);
    assert.equal((await adam('/api/signup', { username: 'adam', password: 'court12' })).status, 400, '7 caractères refusés');
    assert.equal((await adam('/api/signup', { username: 'adam', password: 'secret123' })).status, 201);
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    assert.equal((await adam('/api/me')).data.isAdmin, true);
    assert.equal((await eve('/api/me')).data.isAdmin, false);
    assert.equal(app.db.prepare("SELECT is_admin FROM users WHERE username = 'adam'").get().is_admin, 1);
    // Un ancien mot de passe plus court reste valable à la connexion.
    app.db.prepare("UPDATE users SET password_hash = ? WHERE username = 'eve'").run(await require('../src/auth').hashSecret('court'));
    const again = client(app.base);
    assert.equal((await again('/api/login', { username: 'eve', password: 'court' })).status, 200);
  } finally {
    await app.close();
  }
});

test('réponses refusées : liste réservée au responsable, ignorer une saisie', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base);
    const eve = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    const game = (await eve('/api/game/start', { mode: 'daily' })).data;
    await eve(`/api/game/${game.id}/reveal`, {});
    for (let i = 0; i < 3; i++) await eve(`/api/game/${game.id}/answer`, { text: 'zzzzqqqq' });
    assert.equal((await eve('/api/admin/unknown-answers')).status, 403);
    const list = (await adam('/api/admin/unknown-answers')).data.answers;
    assert.equal(list.length, 1);
    assert.equal(list[0].count, 3);
    assert.equal((await adam('/api/admin/unknown-answers/ignore', { themeId: list[0].themeId, inputKey: list[0].inputKey })).status, 200);
    assert.equal((await adam('/api/admin/unknown-answers')).data.answers.length, 0);
  } finally {
    await app.close();
  }
});
