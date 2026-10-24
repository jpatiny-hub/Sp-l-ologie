'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, answerFor, THEMES } = require('./helpers');

async function playDuelGame(app, call, gameId, wrongSlot) {
  for (let i = 0; i < 7; i++) {
    await call(`/api/game/${gameId}/reveal`, {});
    const text = i === wrongSlot ? 'zzzzzz' : answerFor(app.db, gameId, 1);
    await call(`/api/game/${gameId}/answer`, { text });
  }
}

test("points accordés sur un duel : manche corrigée, résultat révisé, note aux joueurs", async () => {
  const app = await startServer();
  try {
    const adam = client(app.base);
    const eve = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    const started = (await adam('/api/duels', { opponent: 'eve', mode: 'aise' })).data;
    // Adam rate le thème 3 (réponse signalée pendant la manche), Eve joue tout bien : Eve gagne.
    for (let i = 0; i < 7; i++) {
      await adam(`/api/game/${started.id}/reveal`, {});
      if (i === 3) {
        const rep = await adam(`/api/game/${started.id}/report`, { text: 'ma bonne reponse' });
        assert.equal(rep.data.status, 'recorded');
        await adam(`/api/game/${started.id}/skip`, {});
      } else {
        await adam(`/api/game/${started.id}/answer`, { text: answerFor(app.db, started.id, 1) });
      }
    }
    const accepted = (await eve(`/api/duels/${started.duel.id}/accept`, {})).data;
    await playDuelGame(app, eve, accepted.id, -1);
    const before = (await adam(`/api/duels/${started.duel.id}/result`)).data;
    assert.equal(before.winner, 'b', 'Eve gagne avant la révision');
    assert.equal(before.revision, null);

    const report = (await adam('/api/admin/reports')).data.reports[0];
    assert.equal(report.reporters[0].creditableDay != null, true);
    assert.equal(report.reporters[0].duel, true, 'manche de duel créditable');
    const themeId = app.db.prepare('SELECT theme_id FROM rounds WHERE game_id = ? AND slot = 3').get(started.id).theme_id;
    const best = THEMES.get(themeId).answers.find((a) => a.level === 1);
    assert.equal((await eve('/api/admin/reports/grant', { themeId, inputKey: report.inputKey, answerKey: best.key })).status, 403);
    assert.equal((await adam('/api/admin/reports/grant', { themeId, inputKey: report.inputKey })).status, 409, 'réponse visée requise');
    const res = await adam('/api/admin/reports/grant', { themeId, inputKey: report.inputKey, answerKey: best.key, message: 'Bien vu !' });
    assert.equal(res.status, 200);
    assert.equal(res.data.granted.length, 1);

    const row = app.db.prepare('SELECT * FROM duels WHERE id = ?').get(started.duel.id);
    assert.notEqual(row.revised_at, null);
    assert.equal(row.challenger_score, app.db.prepare('SELECT score FROM games WHERE id = ?').get(started.id).score);
    assert.ok(row.challenger_score > row.old_challenger_score, 'le score d\'Adam monte');
    assert.equal(row.challenger_seen_at, null, 'résultat redevenu « à voir »');
    const after = (await adam(`/api/duels/${started.duel.id}/result`)).data;
    assert.ok(after.revision && after.revision.a === row.old_challenger_score);
    const mine = (await adam('/api/reports/mine')).data.reports[0];
    assert.equal(mine.verdict, 'accepted');
    assert.equal(mine.message, 'Bien vu !');
    assert.match(mine.duel, /Ton duel contre eve a été révisé/);
    assert.equal((await adam('/api/me')).data.unreadReports, 1, 'retour non lu signalé à l\'accueil');
    await adam('/api/reports/mine/seen', {});
    assert.equal((await adam('/api/me')).data.unreadReports, 0);
    const list = (await adam('/api/duels')).data;
    assert.equal(list.results[0].revised, true);
    // Déjà accordé : rien de plus.
    assert.equal((await adam('/api/admin/reports/grant', { themeId, inputKey: report.inputKey, answerKey: best.key })).data.granted.length, 0);
  } finally {
    await app.close();
  }
});

test('décisions en lot : aperçu, refus, acceptation avec réponse du thème', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base);
    const eve = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    const g = (await eve('/api/game/start', { mode: 'training' })).data;
    await eve(`/api/game/${g.id}/reveal`, {});
    const round = app.db.prepare('SELECT theme_id FROM rounds WHERE game_id = ? AND slot = 0').get(g.id);
    await eve(`/api/game/${g.id}/report`, { text: 'ma bonne reponse' });
    await eve(`/api/game/${g.id}/report`, { text: 'autre idee' });
    const best = THEMES.get(round.theme_id).answers.find((a) => a.level === 1);
    const base = { themeId: round.theme_id };
    assert.equal((await eve('/api/admin/reports/decisions', { decisions: [] })).status, 403);
    assert.equal((await adam('/api/admin/reports/decisions', { decisions: [] })).status, 400);
    const decisions = [
      { ...base, input: 'ma bonne reponse', verdict: 'accepter', answer: best.label, message: 'Bien vu !' },
      { ...base, input: 'autre idee', verdict: 'refuser', message: 'Non, désolé.' },
      { ...base, input: 'inconnu', verdict: 'refuser' },
      { ...base, input: 'ma bonne reponse', verdict: 'accepter', answer: 'Réponse qui n\'existe pas' },
    ];
    const preview = (await adam('/api/admin/reports/decisions', { decisions })).data.results;
    assert.deepEqual(preview.map((r) => r.ok), [true, true, false, false]);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS n FROM answer_reports WHERE handled_at IS NOT NULL").get().n, 0, 'aperçu : rien de modifié');
    const done = (await adam('/api/admin/reports/decisions', { decisions, dryRun: false })).data.results;
    assert.equal(done[0].ok, true);
    assert.equal(done[1].ok, true);
    const mine = (await eve('/api/reports/mine')).data.reports;
    const accepted = mine.find((r) => r.input === 'ma bonne reponse');
    const refused = mine.find((r) => r.input === 'autre idee');
    assert.equal(accepted.verdict, 'accepted');
    assert.equal(accepted.message, 'Bien vu !');
    assert.equal(refused.verdict, 'refused');
    assert.equal(app.db.prepare("SELECT COUNT(*) AS n FROM answer_reports WHERE handled_at IS NOT NULL").get().n, 2);
  } finally {
    await app.close();
  }
});
