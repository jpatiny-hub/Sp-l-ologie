'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, answerFor } = require('./helpers');

test('le responsable associe après coup une réponse à une manche sans réponse valide', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base); // premier compte : responsable
    const eve = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    const { data: game } = await eve('/api/game/start', { mode: 'daily' });
    // Thème 1 : réponse valide ; thème 2 : chrono écoulé ; thèmes suivants : réponses valides.
    await eve(`/api/game/${game.id}/reveal`, {});
    await eve(`/api/game/${game.id}/answer`, { text: answerFor(app.db, game.id, 1) });
    await eve(`/api/game/${game.id}/reveal`, {});
    app.clock.now += 60 * 1000;
    assert.equal((await eve(`/api/game/${game.id}/answer`, { text: 'peu importe' })).data.result, 'timeout');
    for (let i = 2; i < 7; i++) {
      await eve(`/api/game/${game.id}/reveal`, {});
      await eve(`/api/game/${game.id}/answer`, { text: answerFor(app.db, game.id, 1) });
    }
    const before = app.db.prepare('SELECT score FROM games WHERE id = ?').get(game.id).score;
    const round = app.db.prepare("SELECT theme_id FROM rounds WHERE game_id = ? AND outcome = 'timeout'").get(game.id);
    const theme = require('./helpers').THEMES.get(round.theme_id);
    const answer = theme.answers.find((a) => a.level === 3) || theme.answers[0];
    const body = { day: '2026-10-14', username: 'eve', themeId: round.theme_id, answerKey: answer.key };

    assert.equal((await eve('/api/admin/assign', body)).status, 403, 'réservé au responsable');
    assert.equal((await adam('/api/admin/assign', { ...body, answerKey: 'nimporte' })).status, 409, 'réponse hors du thème');
    assert.equal((await adam('/api/admin/assign', { ...body, username: 'inconnu' })).status, 404);
    assert.equal((await adam('/api/admin/assign', { ...body, day: '2026-10-13' })).status, 404, 'pas de forage ce jour-là');

    const res = await adam('/api/admin/assign', body);
    assert.equal(res.status, 200);
    assert.ok(res.data.points > 0);
    const after = app.db.prepare('SELECT score FROM games WHERE id = ?').get(game.id).score;
    assert.equal(after, before + res.data.points, 'le score du forage monte');
    const row = app.db.prepare('SELECT outcome, answer_label, credited FROM rounds WHERE game_id = ? AND theme_id = ?').get(game.id, round.theme_id);
    assert.equal(row.outcome, 'answer');
    assert.equal(row.answer_label, answer.label);
    assert.equal(row.credited, 1);
    assert.equal(app.db.prepare('SELECT n FROM answer_counts WHERE theme_id = ? AND answer_key = ?').get(round.theme_id, answer.key).n, 1);
    // La même réponse ne peut pas être attribuée deux fois.
    assert.equal((await adam('/api/admin/assign', body)).status, 409);
    // Une réponse valide peut être remplacée par une autre : points et décomptes suivent.
    const other = theme.answers.find((a) => a.key !== answer.key && a.level === 1) || theme.answers.find((a) => a.key !== answer.key);
    const scoreBefore = app.db.prepare('SELECT score FROM games WHERE id = ?').get(game.id).score;
    const swap = await adam('/api/admin/assign', { ...body, answerKey: other.key });
    assert.equal(swap.status, 200);
    assert.equal(swap.data.previous.answer, answer.label);
    assert.equal(swap.data.answer, other.label);
    const scoreAfter = app.db.prepare('SELECT score FROM games WHERE id = ?').get(game.id).score;
    assert.equal(scoreAfter, scoreBefore - swap.data.previous.points + swap.data.points, 'le score du forage est recalculé');
    assert.equal(app.db.prepare('SELECT n FROM answer_counts WHERE theme_id = ? AND answer_key = ?').get(round.theme_id, answer.key).n, 0, "l'ancienne réponse perd son décompte");
    assert.equal(app.db.prepare('SELECT n FROM answer_counts WHERE theme_id = ? AND answer_key = ?').get(round.theme_id, other.key).n, 1);
    assert.equal(app.db.prepare('SELECT answer_label FROM rounds WHERE game_id = ? AND theme_id = ?').get(game.id, round.theme_id).answer_label, other.label);
    // Une réponse attribuée après coup ne donne pas de badge de rapidité (« In extremis »).
    const kinds = app.db.prepare('SELECT kind FROM badges WHERE user_id = (SELECT id FROM users WHERE username_key = ?)').all('eve').map((r) => r.kind);
    assert.equal(kinds.includes('in-extremis'), false);
    // Le comparatif montre la réponse attribuée.
    const cmp = (await eve('/api/compare?date=2026-10-14')).data;
    const evesRound = cmp.players.find((p) => p.username === 'eve').rounds.find((r) => r.themeId === round.theme_id);
    assert.equal(evesRound.answer, other.label);
  } finally {
    await app.close();
  }
});
