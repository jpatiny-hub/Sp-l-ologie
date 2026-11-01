'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client } = require('./helpers');

test('vote de la semaine : bêta chez le responsable, trois voix par joueur, décompte caché jusqu’à la fin de la semaine', async () => {
  const app = await startServer();
  try {
    const admin = client(app.base);
    const eve = client(app.base);
    const dan = client(app.base);
    await admin('/api/signup', { username: 'chef', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    await dan('/api/signup', { username: 'dan', password: 'secret123' });
    for (const t of ['Un instrument à vent', 'Une race de chien', 'Un fromage belge', 'Une capitale africaine']) await eve('/api/themes/suggest', { title: t });
    await dan('/api/themes/suggest', { title: 'Un volcan actif' });
    const ids = Object.fromEntries((await admin('/api/admin/theme-suggestions')).data.suggestions.map((s) => [s.title, s.id]));

    // Bêta : invisible pour les joueurs, visible pour le responsable.
    assert.equal((await eve('/api/me')).data.themeVote, null);
    assert.equal((await eve('/api/themes/vote')).status, 404);
    assert.equal((await eve('/api/admin/theme-vote')).status, 403);
    assert.equal((await eve('/api/admin/theme-vote/candidate', { id: ids['Un volcan actif'] })).status, 403);
    assert.ok((await admin('/api/me')).data.themeVote);

    for (const t of Object.keys(ids)) await admin('/api/admin/theme-vote/candidate', { id: ids[t] });
    let board = (await admin('/api/admin/theme-vote')).data;
    assert.equal(board.week, '2026-10-12');
    assert.equal(board.endsOn, '2026-10-18');
    assert.equal(board.candidates.length, 5);
    assert.equal(board.open, false);

    await admin('/api/admin/theme-vote/open', { open: true });
    let mine = (await dan('/api/themes/vote')).data;
    assert.equal(mine.votesLeft, 3);
    assert.equal(mine.candidates.find((c) => c.id === ids['Un volcan actif']).own, true);
    assert.equal(mine.candidates[0].votes, undefined, 'pas de décompte pour les joueurs pendant la semaine');

    assert.equal((await dan('/api/themes/vote', { id: ids['Un volcan actif'] })).status, 400, 'pas de voix pour sa propre proposition');
    await dan('/api/themes/vote', { id: ids['Un fromage belge'] });
    await dan('/api/themes/vote', { id: ids['Un fromage belge'] }); // deux fois le même : une seule voix
    await dan('/api/themes/vote', { id: ids['Une race de chien'] });
    mine = (await dan('/api/themes/vote', { id: ids['Un instrument à vent'] })).data;
    assert.equal(mine.votesLeft, 0);
    assert.equal((await dan('/api/themes/vote', { id: ids['Une capitale africaine'] })).status, 409, 'trois voix au plus');
    mine = (await dan('/api/themes/vote', { id: ids['Un instrument à vent'], on: false })).data;
    assert.equal(mine.votesLeft, 1, 'une voix retirée se redonne ailleurs');
    await eve('/api/themes/vote', { id: ids['Un volcan actif'] });
    await admin('/api/themes/vote', { id: ids['Un fromage belge'] });

    board = (await admin('/api/admin/theme-vote')).data;
    assert.equal(board.voters, 3);
    assert.equal(board.candidates[0].title, 'Un fromage belge');
    assert.equal(board.candidates[0].votes, 2);

    // Retirer un thème du vote efface ses voix.
    await admin('/api/admin/theme-vote/candidate', { id: ids['Une race de chien'], on: false });
    assert.equal((await dan('/api/themes/vote')).data.votesLeft, 2);

    // Semaine suivante : le résultat de la semaine passée est public, le nouveau vote est vide.
    app.clock.now += 7 * 24 * 3600 * 1000;
    mine = (await dan('/api/themes/vote')).data;
    assert.equal(mine.week, '2026-10-19');
    assert.equal(mine.candidates.length, 0);
    assert.equal(mine.votesLeft, 3);
    assert.equal(mine.lastResult.week, '2026-10-12');
    assert.deepEqual(mine.lastResult.ranking[0], { title: 'Un fromage belge', votes: 2 });

    // Fermé de nouveau : retour à la bêta.
    await admin('/api/admin/theme-vote/open', { open: false });
    assert.equal((await dan('/api/themes/vote')).status, 404);
  } finally {
    await app.close();
  }
});
