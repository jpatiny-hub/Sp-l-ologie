'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, answerFor } = require('./helpers');

/** Joue les 7 thèmes de la partie `gameId` avec des réponses du niveau `level`. */
async function playGame(app, call, gameId, level) {
  let state;
  for (let i = 0; i < 7; i++) {
    await call(`/api/game/${gameId}/reveal`, {});
    state = (await call(`/api/game/${gameId}/answer`, { text: answerFor(app.db, gameId, level) })).data.state;
  }
  return state;
}

async function twoPlayers(app) {
  const adam = client(app.base);
  const eve = client(app.base);
  await adam('/api/signup', { username: 'adam', password: 'secret123' });
  await eve('/api/signup', { username: 'eve', password: 'secret123' });
  return { adam, eve };
}

test('duel : les deux jouent les mêmes thèmes sans voir la rareté, puis le résultat se révèle', async () => {
  const app = await startServer();
  try {
    const { adam, eve } = await twoPlayers(app);
    assert.equal((await adam('/api/duels', { opponent: 'adam', mode: 'standard' })).status, 400, 'pas de duel contre soi-même');
    assert.equal((await adam('/api/duels', { opponent: 'inconnu', mode: 'standard' })).status, 404);
    assert.equal((await adam('/api/duels', { opponent: 'eve', mode: 'bizarre' })).status, 400);

    const started = (await adam('/api/duels', { opponent: 'eve', mode: 'standard' })).data;
    assert.equal(started.mode, 'duel');
    assert.equal(started.duel.opponent, 'eve');
    assert.equal(started.rounds.length, 7);
    assert.equal(started.noTimer, false);
    assert.equal((await adam('/api/duels', { opponent: 'eve', mode: 'standard' })).status, 409, 'un seul duel ouvert par paire');

    // Eve ne peut pas relever le défi avant qu'Adam ait fini.
    let list = (await eve('/api/duels')).data;
    assert.equal(list.received.length, 0);
    const id = started.duel.id;
    assert.equal((await eve(`/api/duels/${id}/accept`, {})).status, 409);

    await adam(`/api/game/${started.id}/reveal`, {});
    const one = (await adam(`/api/game/${started.id}/answer`, { text: answerFor(app.db, started.id, 1) })).data;
    assert.equal(one.round.points, null, 'pas de points pendant le duel');
    assert.equal(one.round.tier, null, 'pas de rareté pendant le duel');
    assert.equal(one.round.outcome, 'answer');
    assert.equal(one.state.score, null);
    for (let i = 1; i < 7; i++) {
      await adam(`/api/game/${started.id}/reveal`, {});
      await adam(`/api/game/${started.id}/answer`, { text: answerFor(app.db, started.id, 1) });
    }
    assert.equal((await adam(`/api/game/${started.id}/answers?slot=0`)).status, 403, 'les réponses du thème restent cachées pendant le duel');
    assert.equal((await adam(`/api/duels/${id}/result`)).status, 409, 'pas de résultat avant la fin des deux');

    list = (await eve('/api/duels')).data;
    assert.equal(list.received.length, 1);
    assert.equal(list.received[0].status, 'invited');
    assert.equal(list.received[0].other.username, 'adam');
    assert.equal((await eve('/api/me')).data.duels.invites, 1);

    const accepted = (await eve(`/api/duels/${id}/accept`, {})).data;
    assert.equal(accepted.mode, 'duel');
    const themesA = app.db.prepare('SELECT theme_id FROM rounds WHERE game_id = ? ORDER BY slot').all(started.id).map((r) => r.theme_id);
    const themesB = app.db.prepare('SELECT theme_id FROM rounds WHERE game_id = ? ORDER BY slot').all(accepted.id).map((r) => r.theme_id);
    assert.deepEqual(themesB, themesA, 'mêmes thèmes pour les deux');
    // Reprendre le défi deux fois renvoie la même partie.
    assert.equal((await eve(`/api/duels/${id}/accept`, {})).data.id, accepted.id);

    const finished = await playGame(app, eve, accepted.id, 3);
    assert.equal(finished.finished, true);
    const result = (await eve(`/api/duels/${id}/result`)).data;
    assert.equal(result.themes.length, 7);
    assert.equal(result.a.username, 'adam');
    assert.equal(result.b.username, 'eve');
    assert.ok(result.a.score >= 0 && result.b.score >= 0);
    assert.equal(result.themes.reduce((n, t) => n + t.a.points, 0), result.a.score);
    assert.equal(result.themes.reduce((n, t) => n + t.b.points, 0), result.b.score);
    assert.ok(result.winner === 'a' || result.winner === 'b' || result.winner === null);
    assert.equal((await adam(`/api/duels/${id}/result`)).status, 200, 'le défieur le voit aussi');

    // Une fois le duel fini, les points de la partie deviennent visibles.
    const after = (await adam(`/api/game/${started.id}`)).data;
    assert.equal(after.score, result.a.score);

    const adamList = (await adam('/api/duels')).data;
    assert.equal(adamList.results.length, 1);
    assert.equal(adamList.results[0].seen, false);
    assert.equal((await adam('/api/me')).data.duels.unseen, 1);
    await adam(`/api/duels/${id}/seen`, {});
    assert.equal((await adam('/api/me')).data.duels.unseen, 0);
    assert.equal(adamList.opponents[0].username, 'eve');
    assert.equal((await adam('/api/duels')).data.record.wins + (await adam('/api/duels')).data.record.losses + (await adam('/api/duels')).data.record.draws, 1);

    // Badges de duel et aucune trace dans les classements du jour.
    const badgesA = (await adam('/api/profile')).data.badges.filter((b) => b.count).map((b) => b.id);
    const badgesE = (await eve('/api/profile')).data.badges.filter((b) => b.count).map((b) => b.id);
    assert.ok(badgesA.includes('attaquant-1') && badgesA.includes('diplomate-3') === false);
    assert.ok(badgesE.includes('defenseur-1'));
    assert.equal((await adam('/api/leaderboard?period=day')).data.entries.length, 0, 'un duel ne compte pas au podium');
    // Revanche : un nouveau duel contre le même joueur est possible une fois le premier terminé.
    assert.equal((await adam('/api/duels', { opponent: 'eve', mode: 'standard' })).status, 200);
  } finally {
    await app.close();
  }
});

test('duel à l\'aise : pas de chrono, et on peut refuser un défi', async () => {
  const app = await startServer();
  try {
    const { adam, eve } = await twoPlayers(app);
    const started = (await adam('/api/duels', { opponent: 'eve', mode: 'aise' })).data;
    assert.equal(started.noTimer, true);
    await adam(`/api/game/${started.id}/reveal`, {});
    const ready = (await adam(`/api/game/${started.id}`)).data;
    assert.equal(ready.current.remainingMs, null, 'aucun compte à rebours');
    app.clock.now += 20 * 60 * 1000; // vingt minutes de réflexion
    const res = (await adam(`/api/game/${started.id}/answer`, { text: answerFor(app.db, started.id, 1) })).data;
    assert.equal(res.result, 'ok', 'la réponse est acceptée malgré le temps écoulé');
    for (let i = 1; i < 7; i++) {
      await adam(`/api/game/${started.id}/reveal`, {});
      await adam(`/api/game/${started.id}/answer`, { text: answerFor(app.db, started.id, 1) });
    }
    assert.equal((await eve(`/api/duels/${started.duel.id}/decline`, {})).status, 200);
    assert.equal((await eve('/api/duels')).data.received.length, 0);
    // Une fois refusé, le défieur peut relancer un duel.
    assert.equal((await adam('/api/duels', { opponent: 'eve', mode: 'standard' })).status, 200);
  } finally {
    await app.close();
  }
});

test('duel standard : le chrono court toujours, et un duel sans réponse finit par expirer', async () => {
  const app = await startServer();
  try {
    const { adam, eve } = await twoPlayers(app);
    const started = (await adam('/api/duels', { opponent: 'eve', mode: 'standard' })).data;
    await adam(`/api/game/${started.id}/reveal`, {});
    app.clock.now += 60 * 1000;
    const late = (await adam(`/api/game/${started.id}/answer`, { text: answerFor(app.db, started.id, 1) })).data;
    assert.equal(late.result, 'timeout');
    app.clock.now += 5 * 24 * 3600 * 1000;
    assert.equal((await eve('/api/duels')).data.received.length, 0);
    assert.equal((await adam('/api/duels')).data.sent.length, 0, 'duel expiré');
    assert.equal((await adam('/api/duels', { opponent: 'eve', mode: 'standard' })).status, 200, 'on peut relancer');
  } finally {
    await app.close();
  }
});

test('mode à l\'aise en entraînement : sans chrono et sans effet sur les statistiques', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    const game = (await adam('/api/game/start', { mode: 'training', noTimer: true })).data;
    assert.equal(game.noTimer, true);
    await adam(`/api/game/${game.id}/reveal`, {});
    app.clock.now += 10 * 60 * 1000;
    assert.equal((await adam(`/api/game/${game.id}/answer`, { text: answerFor(app.db, game.id, 1) })).data.result, 'ok');
    for (let i = 1; i < 7; i++) {
      await adam(`/api/game/${game.id}/reveal`, {});
      await adam(`/api/game/${game.id}/answer`, { text: answerFor(app.db, game.id, 1) });
    }
    const stats = (await adam('/api/profile')).data.playerStats.training;
    assert.equal(stats.games, 0, 'une partie à l\'aise ne compte pas dans les statistiques');
    const normal = (await adam('/api/game/start', { mode: 'training' })).data;
    assert.equal(normal.noTimer, false);
  } finally {
    await app.close();
  }
});

test('badges de duel : exploits (duel parfait, remontada, invaincu) et rivalités', async () => {
  const { BadgeService } = require('../src/badges');
  const app = await startServer();
  try {
    const names = ['adam', 'eve', 'jose', 'lea'];
    for (const n of names) await client(app.base)('/api/signup', { username: n, password: 'secret123' });
    const id = (n) => app.db.prepare('SELECT id FROM users WHERE username_key = ?').get(n).id;
    const badges = new BadgeService(app.db, () => app.clock.now);
    let tick = 0;
    /** Duel terminé entre deux joueurs : points par thème de chacun, vainqueur déduit du total. */
    const duel = (a, b, pa, pb, mode = 'standard') => {
      const game = (user, points) => {
        const { lastInsertRowid } = app.db
          .prepare("INSERT INTO games (user_id, mode, day, score, created_at, finished_at) VALUES (?, 'duel', '2026-10-14', ?, 1, 2)")
          .run(user, points.reduce((x, y) => x + y, 0));
        points.forEach((p, slot) => app.db.prepare("INSERT INTO rounds (game_id, slot, theme_id, outcome, points, answered_at) VALUES (?, ?, 'villes', 'answer', ?, 1)").run(lastInsertRowid, slot, p));
        return Number(lastInsertRowid);
      };
      const ga = game(id(a), pa);
      const gb = game(id(b), pb);
      const sa = pa.reduce((x, y) => x + y, 0);
      const sb = pb.reduce((x, y) => x + y, 0);
      const winner = sa > sb ? id(a) : sb > sa ? id(b) : null;
      app.db
        .prepare("INSERT INTO duels (challenger_id, opponent_id, mode, status, created_at, expires_at, finished_at, challenger_game_id, opponent_game_id, winner_id, challenger_score, opponent_score) VALUES (?, ?, ?, 'done', 1, 9, ?, ?, ?, ?, ?, ?)")
        .run(id(a), id(b), mode, ++tick, ga, gb, winner, sa, sb);
      badges.awardDuels(id(a), '2026-10-14');
      badges.awardDuels(id(b), '2026-10-14');
    };
    const has = (n) => new Set(app.db.prepare('SELECT kind FROM badges WHERE user_id = ?').all(id(n)).map((r) => r.kind));

    // Remontada : adam perd les 3 premiers thèmes, puis gagne.
    duel('adam', 'eve', [10, 10, 10, 90, 90, 90, 90], [50, 50, 50, 10, 10, 10, 10]);
    assert.ok(has('adam').has('remontada'));
    assert.ok(has('adam').has('attaquant-1') && has('eve').has('defenseur-1'));
    assert.equal(has('eve').has('remontada'), false);
    assert.equal(has('adam').has('duel-parfait'), false);
    // Duel parfait : les 7 thèmes gagnés, mais pas en duel « à l'aise ».
    duel('jose', 'eve', [60, 60, 60, 60, 60, 60, 60], [10, 10, 10, 10, 10, 10, 10], 'aise');
    assert.equal(has('jose').has('duel-parfait'), false, "pas d'exploit en duel à l'aise");
    assert.ok(has('jose').has('attaquant-1'), "mais la participation compte");
    duel('lea', 'eve', [60, 60, 60, 60, 60, 60, 60], [10, 10, 10, 10, 10, 10, 10]);
    assert.ok(has('lea').has('duel-parfait'));
    // Souffre-douleur et némésis : trois victoires contre le même joueur.
    duel('adam', 'eve', [60, 60, 60, 60, 60, 60, 60], [10, 10, 10, 10, 10, 10, 10]);
    assert.equal(has('adam').has('souffre-douleur'), false);
    duel('adam', 'eve', [60, 60, 60, 60, 60, 60, 60], [10, 10, 10, 10, 10, 10, 10]);
    assert.ok(has('adam').has('souffre-douleur'));
    assert.ok(has('eve').has('nemesis'));
    // Rival : cinq duels contre le même joueur ; diplomate : trois adversaires.
    duel('eve', 'adam', [10, 10, 10, 10, 10, 10, 10], [20, 20, 20, 20, 20, 20, 20]);
    assert.equal(has('adam').has('rival'), false, 'quatre duels seulement');
    duel('eve', 'adam', [10, 10, 10, 10, 10, 10, 10], [20, 20, 20, 20, 20, 20, 20]);
    assert.ok(has('adam').has('rival'));
    assert.ok(has('adam').has('invaincu'), 'cinq victoires standard d\'affilée');
    assert.equal(has('adam').has('diplomate-3'), false, 'adam n\'a défié qu\'un seul joueur');
    duel('adam', 'jose', [10, 10, 10, 10, 10, 10, 10], [10, 10, 10, 10, 10, 10, 20]);
    duel('adam', 'lea', [10, 10, 10, 10, 10, 10, 10], [10, 10, 10, 10, 10, 10, 20]);
    assert.ok(has('adam').has('diplomate-3'), 'trois adversaires différents défiés');
    assert.ok(has('eve').has('sentinelle-3'), 'eve a relevé le défi de trois joueurs différents');
  } finally {
    await app.close();
  }
});

test('badges de victoire écrasante et d\'égalité en duel', async () => {
  const { BadgeService } = require('../src/badges');
  const app = await startServer();
  try {
    const adam = client(app.base);
    const eve = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    const idOf = (name) => app.db.prepare('SELECT id FROM users WHERE username = ?').get(name).id;
    const a = idOf('adam');
    const e = idOf('eve');
    const badges = new BadgeService(app.db, () => Date.now());
    const now = Date.now();
    const game = (user, points) => {
      const id = app.db.prepare("INSERT INTO games (user_id, mode, day, score, created_at, finished_at) VALUES (?, 'duel', '2026-10-24', ?, ?, ?)").run(user, points.reduce((s, p) => s + p, 0), now, now).lastInsertRowid;
      points.forEach((p, i) => app.db.prepare("INSERT INTO rounds (game_id, slot, theme_id, points) VALUES (?, ?, 'x', ?)").run(id, i, p));
      return id;
    };
    const duel = (challenger, opponent, cp, op) => {
      const cg = game(challenger, cp);
      const og = game(opponent, op);
      const cs = cp.reduce((s, p) => s + p, 0);
      const os = op.reduce((s, p) => s + p, 0);
      app.db
        .prepare("INSERT INTO duels (challenger_id, opponent_id, mode, status, created_at, expires_at, finished_at, challenger_game_id, opponent_game_id, winner_id, challenger_score, opponent_score) VALUES (?, ?, 'standard', 'done', ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(challenger, opponent, now, now, now, cg, og, cs > os ? challenger : os > cs ? opponent : null, cs, os);
    };
    const kinds = (user) => app.db.prepare('SELECT kind FROM badges WHERE user_id = ?').all(user).map((r) => r.kind);
    // Adam attaque et gagne 5 thèmes sur 7 avec 140 points d'avance : coup de boutoir seulement.
    duel(a, e, [60, 60, 60, 60, 60, 0, 0], [20, 20, 20, 20, 20, 20, 20]);
    badges.awardDuels(a, '2026-10-24');
    badges.awardDuels(e, '2026-10-24');
    assert.ok(kinds(a).includes('coup-de-boutoir'));
    assert.ok(!kinds(a).includes('annihilation'));
    assert.ok(!kinds(e).includes('coup-de-boutoir'));
    // Eve défend et gagne 6 thèmes sur 7 avec 240 points d'avance : imprenable et muraille de Troie.
    duel(a, e, [10, 0, 0, 0, 0, 0, 30], [60, 60, 60, 60, 60, 60, 0]);
    badges.awardDuels(e, '2026-10-24');
    assert.ok(kinds(e).includes('imprenable'));
    assert.ok(kinds(e).includes('muraille-de-troie'));
    // Égalité parfaite : frères d'armes et jumeaux ; deux égalités de plus : match miroir.
    duel(a, e, [10, 20, 30, 10, 20, 30, 10], [10, 20, 30, 10, 20, 30, 10]);
    badges.awardDuels(a, '2026-10-24');
    assert.ok(kinds(a).includes('freres-d-armes'));
    assert.ok(kinds(a).includes('jumeaux'));
    assert.ok(!kinds(a).includes('match-miroir'));
    duel(a, e, [10, 20, 30, 10, 20, 30, 10], [30, 10, 10, 20, 20, 30, 10]);
    duel(a, e, [10, 20, 30, 10, 20, 30, 10], [10, 20, 30, 30, 10, 20, 10]);
    badges.awardDuels(a, '2026-10-24');
    assert.ok(kinds(a).includes('match-miroir'));
  } finally {
    await app.close();
  }
});
