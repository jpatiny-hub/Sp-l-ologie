'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client } = require('./helpers');

test('annonces : le responsable publie, chaque joueur la voit jusqu\'à ce qu\'il l\'ait lue', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base); // premier compte : responsable
    const eve = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    assert.equal((await eve('/api/admin/announcements', { text: 'Coucou' })).status, 403, 'réservé au responsable');
    assert.equal((await adam('/api/admin/announcements', { text: 'a' })).status, 400, 'trop court');
    assert.equal((await adam('/api/admin/announcements', { text: 'x'.repeat(601) })).status, 400, 'trop long');

    const first = (await adam('/api/admin/announcements', { text: 'Le thème spécial arrive ce soir !', days: 3 })).data;
    assert.ok(first.id);
    let me = (await eve('/api/me')).data;
    assert.equal(me.announcements.length, 1);
    assert.equal(me.announcements[0].text, 'Le thème spécial arrive ce soir !');
    await eve('/api/announcements/seen', { id: first.id });
    assert.equal((await eve('/api/me')).data.announcements.length, 0, 'lue : elle disparaît');
    assert.equal((await adam('/api/me')).data.announcements.length, 1, 'adam ne l\'a pas encore lue');

    // Une seconde annonce est de nouveau proposée à Eve ; retirée, elle disparaît pour tous.
    const second = (await adam('/api/admin/announcements', { text: 'Deuxième message' })).data;
    assert.equal((await eve('/api/me')).data.announcements.length, 1);
    assert.equal((await adam('/api/admin/announcements/remove', { id: second.id })).status, 200);
    assert.equal((await eve('/api/me')).data.announcements.length, 0);
    const list = (await adam('/api/admin/announcements')).data.announcements;
    assert.deepEqual(list.map((a) => a.status), ['removed', 'active']);

    // Au bout de sa durée (3 jours), la première n'est plus proposée à ceux qui ne l'ont pas lue.
    app.clock.now += 4 * 24 * 3600 * 1000;
    assert.equal((await adam('/api/me')).data.announcements.length, 0);
    assert.equal((await adam('/api/admin/announcements')).data.announcements.find((a) => a.id === first.id).status, 'expired');
  } finally {
    await app.close();
  }
});
