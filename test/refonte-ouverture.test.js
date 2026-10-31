'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client } = require('./helpers');

test('refonte : réservée au responsable avant la date, ouverte à tous ensuite, avatars remis au standard une seule fois', async () => {
  const app = await startServer({ refonteFrom: '2026-10-16' });
  try {
    const chef = client(app.base);
    const ada = client(app.base);
    await chef('/api/signup', { username: 'chef', password: 'secret123' });
    await ada('/api/signup', { username: 'ada', password: 'secret123' });
    const me = (await ada('/api/me')).data;
    assert.equal(me.refonte, false);
    assert.deepEqual(me.news, [], "la note de la refonte n'est pas encore visible");
    // Avant l'ouverture, le vestiaire 16-bit est refusé aux joueurs.
    const nain = { ...me.avatar, espece: 'nain' };
    assert.equal((await ada('/api/profile/avatar', { avatar: nain })).status, 403);
    const blond = { ...me.avatar, couleur: 'blond' };
    assert.equal((await ada('/api/profile/avatar', { avatar: blond })).status, 200);

    app.clock.now += 2 * 24 * 3600 * 1000; // 16 octobre, après 2 h
    const after = (await ada('/api/me')).data;
    assert.equal(after.refonte, true);
    assert.deepEqual(after.news.map((n) => n.title), ['La mine fait peau neuve'], 'la note de la refonte apparaît à l\'ouverture');
    assert.equal(after.avatar.couleur, 'brun', "l'ancien avatar est remplacé par le personnage standard");
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM avatar_backup').get().n, 1, "l'ancien avatar est gardé en copie");
    assert.equal((await ada('/api/profile/avatar', { avatar: { ...after.avatar, espece: 'nain' } })).status, 200);
    // Une seule remise à zéro : le nouvel avatar reste.
    assert.equal((await ada('/api/me')).data.avatar.espece, 'nain');
  } finally {
    await app.close();
  }
});
