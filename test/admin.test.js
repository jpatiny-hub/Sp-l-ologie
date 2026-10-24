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

test("code d'invitation : inscription libre par défaut, puis code exigé une fois défini", async () => {
  const app = await startServer();
  try {
    const adam = client(app.base);
    const eve = client(app.base);
    const guest = client(app.base);
    assert.equal((await guest('/api/signup-info')).data.inviteRequired, false);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    assert.equal((await eve('/api/admin/invite-code', { code: 'mine2026' })).status, 401);
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    assert.equal((await eve('/api/admin/invite-code', { code: 'mine2026' })).status, 403, 'réservé au responsable');
    assert.equal((await adam('/api/admin/invite-code', { code: 'abc' })).status, 400, 'trop court');
    assert.equal((await adam('/api/admin/invite-code', { code: 'Mine 2026' })).status, 200);
    assert.equal((await adam('/api/admin/invite-code')).data.code, 'Mine 2026');
    assert.equal((await guest('/api/signup-info')).data.inviteRequired, true);
    assert.equal((await guest('/api/signup', { username: 'zoe', password: 'secret123' })).status, 403, 'sans code');
    assert.equal((await guest('/api/signup', { username: 'zoe', password: 'secret123', inviteCode: 'autre' })).status, 403, 'mauvais code');
    assert.equal((await guest('/api/signup', { username: 'zoe', password: 'secret123', inviteCode: ' mine2026 ' })).status, 201, 'code accepté sans tenir compte de la casse ni des espaces');
    // Les comptes existants se connectent sans code.
    assert.equal((await client(app.base)('/api/login', { username: 'eve', password: 'secret123' })).status, 200);
    assert.equal((await adam('/api/admin/invite-code', { code: '' })).data.code, null);
    assert.equal((await client(app.base)('/api/signup', { username: 'leo', password: 'secret123' })).status, 201, 'inscriptions rouvertes');
  } finally {
    await app.close();
  }
});

test('essai d\'un thème : réservé au responsable, réponse reconnue ou refusée avec les plus proches', async () => {
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
    assert.equal(results[2].found, false);
    assert.equal(results[2].near.length, 3);
    assert.equal((await adam('/api/admin/theme-test', { themeId: 'inconnu', inputs: ['a'] })).status, 404);
  } finally {
    await app.close();
  }
});
