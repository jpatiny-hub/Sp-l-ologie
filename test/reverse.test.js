'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, THEMES } = require('./helpers');
const { openDb } = require('../src/db');
const { ReverseService, POINTS } = require('../src/reverse');

function service() {
  return new ReverseService(openDb(':memory:'), THEMES);
}

/** Mots-clés qui désignent le thème : les mots les plus rares de son titre. */
function keywordsFor(rs, themeId) {
  const title = THEMES.get(themeId).title;
  return title.replace(/\(.*?\)/g, '');
}

test('mode inversé : indices du plus rare au plus évident, et un seul thème contient tous les indices', () => {
  const rs = service();
  const state = rs.start(1);
  assert.equal(state.rounds, 5);
  assert.equal(state.clues.length, 1, 'un seul indice au départ');
  const game = rs.games.get(1);
  for (const round of game.rounds) {
    assert.ok(round.clues.length >= 4);
    const levels = round.clues.map((c) => c.level);
    assert.deepEqual(levels, [...levels].sort((a, b) => b - a), 'du plus rare au plus évident');
    assert.equal(new Set(game.rounds.map((r) => r.themeId)).size, 5, 'cinq thèmes différents');
  }
});

test('mode inversé : une proposition ratée révèle l\'indice suivant, un thème juste rapporte des points dégressifs', () => {
  const rs = service();
  rs.start(1);
  const round = rs.games.get(1).rounds[0];
  // Proposition fausse : un thème qui ne contient pas l'indice.
  const wrong = [...THEMES.values()].find((t) => t.active && t.answers.length >= 12 && t.id !== round.themeId && !round.clues[0].keys.some((k) => t.index.has(k)));
  const miss = rs.guess(1, wrong.title.replace(/\(.*?\)/g, ''));
  assert.ok(['non', 'proche', 'vague', 'incompris'].includes(miss.guesses[0].verdict));
  if (miss.guesses[0].verdict === 'non' || miss.guesses[0].verdict === 'proche') assert.equal(miss.clues.length, 2);
  // Proposition juste avec les mots du titre.
  const before = rs.view(1);
  const hit = rs.guess(1, keywordsFor(rs, round.themeId));
  const last = hit.guesses[hit.guesses.length - 1];
  assert.equal(last.verdict, 'juste');
  assert.equal(hit.status, 'found');
  assert.equal(hit.points, POINTS[before.clues.length - 1]);
  assert.equal(hit.score, hit.points);
  assert.equal(hit.theme, round.title);
});

test('mode inversé : mots incompris ou trop vagues ne révèlent rien', () => {
  const rs = service();
  rs.start(1);
  const a = rs.guess(1, 'zzzqqq');
  assert.equal(a.guesses[0].verdict, 'incompris');
  assert.equal(a.clues.length, 1);
  const b = rs.guess(1, 'animal');
  assert.equal(b.guesses[1].verdict, 'vague');
  assert.equal(b.clues.length, 1);
});

test('mode inversé : abandon, manche suivante et fin de partie', () => {
  const rs = service();
  rs.start(1);
  for (let i = 0; i < 5; i++) {
    const over = rs.giveUp(1);
    assert.equal(over.status, 'failed');
    assert.ok(over.theme);
    const next = rs.next(1);
    assert.equal(next.finished, i === 4);
  }
  assert.equal(rs.view(1).score, 0);
});

test('mode inversé : réservé au responsable et sans effet sur les forages', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base); // premier compte : responsable
    const eve = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    assert.equal((await eve('/api/admin/reverse')).status, 403);
    assert.equal((await eve('/api/admin/reverse/start', {})).status, 403);
    assert.equal((await adam('/api/admin/reverse')).data.active, false);
    const started = await adam('/api/admin/reverse/start', {});
    assert.equal(started.status, 200);
    assert.equal(started.data.clues.length, 1);
    assert.equal(started.data.theme, null, 'le thème reste caché pendant la manche');
    assert.equal(started.data.themeId, null);
    const res = await adam('/api/admin/reverse/guess', { text: 'zzzqqq' });
    assert.equal(res.data.guesses[0].verdict, 'incompris');
    assert.equal((await adam('/api/admin/reverse/guess', { text: '   ' })).status, 400);
    assert.equal((await adam('/api/admin/reverse/next', {})).status, 409, 'la manche est en cours');
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM games').get().n, 0);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM answer_counts').get().n, 0);
  } finally {
    await app.close();
  }
});
