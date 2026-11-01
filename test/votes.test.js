'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client } = require('./helpers');
const { FIRST_THEMES, REACTIONS } = require('../src/votes');

test('vote des thèmes : les 7 thèmes de départ s’ouvrent à tous le lundi 2 novembre 2 h, une réaction par thème jusqu’à vendredi 23 h 59', async () => {
  const app = await startServer();
  try {
    const admin = client(app.base);
    const eve = client(app.base);
    await admin('/api/signup', { username: 'chef', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });

    // Avant le lundi 2 novembre : rien au vote, rien chez les joueurs.
    assert.equal((await eve('/api/me')).data.themeVote, null);
    assert.equal((await eve('/api/themes/vote')).status, 404);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM theme_suggestions').get().n, 0);

    // Lundi 2 novembre 2026, 2 h 10 (heure de Bruxelles) : le vote s'ouvre.
    app.clock.now = Date.UTC(2026, 10, 2, 1, 10);
    let vote = (await eve('/api/themes/vote')).data;
    assert.equal(vote.open, true);
    assert.deepEqual(vote.candidates.map((c) => c.title), FIRST_THEMES);
    assert.equal(vote.candidates.length, 7);
    assert.deepEqual(vote.mine, {});
    assert.equal(vote.canPropose, false);
    assert.equal(vote.closesAt, Date.UTC(2026, 10, 6, 22, 59, 59), 'vendredi 6 novembre 23 h 59 min 59 s, heure de Bruxelles');
    assert.equal((await eve('/api/me')).data.themeVote.candidates.length, 7);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM theme_suggestions').get().n, 7, 'chargés une seule fois');

    // Une réaction par thème, modifiable ; rien d'autre n'est accepté.
    const [a, b] = vote.candidates;
    await eve('/api/themes/vote', { candidate: a.id, reaction: 'adore' });
    vote = (await eve('/api/themes/vote', { candidate: a.id, reaction: 'bof' })).data;
    assert.deepEqual(vote.mine, { [a.id]: 'bof' });
    assert.equal((await eve('/api/themes/vote', { candidate: a.id, reaction: 'génial' })).status, 400);
    assert.equal((await eve('/api/themes/vote', { candidate: 99999, reaction: 'adore' })).status, 404);
    assert.equal((await eve('/api/themes/vote', { reaction: 'adore' })).status, 400);
    vote = (await eve('/api/themes/vote', { candidate: a.id, reaction: null })).data;
    assert.deepEqual(vote.mine, {}, 'réaction retirée');

    // Les décomptes ne sont vus que du responsable.
    assert.equal(vote.candidates[0].reactions, undefined);
    assert.equal((await eve('/api/admin/theme-vote')).status, 403);
    await eve('/api/themes/vote', { candidate: a.id, reaction: 'adore' });
    await admin('/api/themes/vote', { candidate: a.id, reaction: 'adore' });
    await admin('/api/themes/vote', { candidate: b.id, reaction: 'deja-vu' });
    const board = (await admin('/api/admin/theme-vote')).data;
    assert.equal(board.voters, 2);
    assert.equal(board.candidates[0].reactions.adore, 2);
    assert.equal(board.candidates[1].reactions['deja-vu'], 1);
    assert.deepEqual(Object.keys(board.candidates[0].reactions), REACTIONS);

    // Une fois toutes ses réactions données, le joueur peut proposer le sien.
    for (const c of vote.candidates) vote = (await eve('/api/themes/vote', { candidate: c.id, reaction: 'adore' })).data;
    assert.equal(vote.canPropose, true);

    // Vendredi 23 h 59 : toujours ouvert ; samedi 0 h 00 : clos, mais on peut proposer.
    app.clock.now = Date.UTC(2026, 10, 6, 22, 59, 0);
    assert.equal((await eve('/api/themes/vote', { candidate: a.id, reaction: 'bof' })).status, 200);
    app.clock.now = Date.UTC(2026, 10, 6, 23, 0, 1);
    vote = (await eve('/api/themes/vote')).data;
    assert.equal(vote.open, false);
    assert.equal(vote.canPropose, true);
    assert.equal((await eve('/api/themes/vote', { candidate: a.id, reaction: 'adore' })).status, 409);

    // Beaucoup de propositions possibles.
    for (let i = 0; i < 8; i++) assert.equal((await eve('/api/themes/suggest', { title: `Idée numéro ${i}` })).status, 201);

    // Le responsable ferme le vote aux joueurs : retour à la bêta.
    await admin('/api/admin/theme-vote/open', { open: false });
    assert.equal((await eve('/api/themes/vote')).status, 404);
    assert.equal((await admin('/api/themes/vote')).status, 200);
  } finally {
    await app.close();
  }
});

test('vote des thèmes : le responsable met d’autres propositions au vote la semaine suivante', async () => {
  const app = await startServer();
  try {
    const admin = client(app.base);
    const eve = client(app.base);
    await admin('/api/signup', { username: 'chef', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    app.clock.now = Date.UTC(2026, 10, 9, 10, 0); // lundi 9 novembre
    await eve('/api/themes/suggest', { title: 'Un volcan actif' });
    const id = (await admin('/api/admin/theme-suggestions')).data.suggestions.find((s) => s.title === 'Un volcan actif').id;
    assert.equal((await eve('/api/admin/theme-vote/candidate', { id })).status, 403);
    let board = (await admin('/api/admin/theme-vote/candidate', { id })).data;
    assert.deepEqual(board.candidates.map((c) => c.title), ['Un volcan actif']);
    await eve('/api/themes/vote', { candidate: id, reaction: 'facile' });
    board = (await admin('/api/admin/theme-vote')).data;
    assert.equal(board.candidates[0].reactions.facile, 1);
    assert.equal(board.lastResult.week, '2026-11-02', 'le vote précédent est gardé en résultat');
    board = (await admin('/api/admin/theme-vote/candidate', { id, on: false })).data;
    assert.equal(board.candidates.length, 0);
  } finally {
    await app.close();
  }
});
