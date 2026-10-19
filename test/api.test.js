'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { matchAnswer, toKey } = require('../src/matching');
const { LEVEL_WEIGHTS } = require('../src/scoring');
const { THEMES, startServer, client, answerFor } = require('./helpers');

test('inscription, connexion, session persistante et déconnexion', async () => {
  const app = await startServer();
  try {
    const alice = client(app.base);
    assert.equal((await alice('/api/me')).data.user, null);

    const signup = await alice('/api/signup', { username: 'Alice', password: 'secret123' });
    assert.equal(signup.status, 201);
    assert.match(signup.data.recoveryCode, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.equal((await alice('/api/me')).data.user.username, 'Alice');

    // Identifiant unique, insensible à la casse.
    const bob = client(app.base);
    assert.equal((await bob('/api/signup', { username: 'alice', password: 'autre123' })).status, 409);
    assert.equal((await bob('/api/signup', { username: 'a', password: 'autre123' })).status, 400);
    assert.equal((await bob('/api/signup', { username: 'Bob', password: '123' })).status, 400);

    // Déconnexion puis reconnexion « depuis un autre appareil ».
    await alice('/api/logout', {});
    assert.equal((await alice('/api/me')).data.user, null);
    const phone = client(app.base);
    assert.equal((await phone('/api/login', { username: 'ALICE', password: 'mauvais' })).status, 401);
    assert.equal((await phone('/api/login', { username: 'ALICE', password: 'secret123' })).status, 200);
    assert.equal((await phone('/api/me')).data.user.username, 'Alice');

    // Mot de passe oublié : le code de récupération permet d'en choisir un nouveau.
    const lost = client(app.base);
    assert.equal((await lost('/api/recover', { username: 'alice', recoveryCode: 'AAAA-BBBB-CCCC', newPassword: 'nouveau1' })).status, 401);
    const recovered = await lost('/api/recover', {
      username: 'alice',
      recoveryCode: signup.data.recoveryCode.toLowerCase(),
      newPassword: 'nouveau1',
    });
    assert.equal(recovered.status, 200);
    assert.notEqual(recovered.data.recoveryCode, signup.data.recoveryCode);
    // Les anciennes sessions sont fermées, le nouveau mot de passe fonctionne.
    assert.equal((await phone('/api/me')).data.user, null);
    assert.equal((await phone('/api/login', { username: 'alice', password: 'nouveau1' })).status, 200);

    // Les requêtes POST doivent être en JSON (protection CSRF).
    const form = await fetch(`${app.base}/api/login`, { method: 'POST', body: 'username=alice' });
    assert.equal(form.status, 415);
  } finally {
    await app.close();
  }
});

test('partie quotidienne complète, chrono, thèmes communs et podium', async () => {
  const app = await startServer();
  try {
    const alice = client(app.base);
    const bob = client(app.base);
    await alice('/api/signup', { username: 'alice', password: 'secret123' });
    await bob('/api/signup', { username: 'bob', password: 'secret123' });

    const { data: game } = await alice('/api/game/start', { mode: 'daily' });
    assert.equal(game.rounds.length, 7);
    assert.ok(game.rounds.every((r) => r.title === null), 'les thèmes restent cachés avant révélation');

    // Thème 1 : réponse inconnue (on peut réessayer), puis réponse rare.
    let state = (await alice(`/api/game/${game.id}/reveal`, {})).data;
    assert.ok(state.current.remainingMs > 29000);
    let res = await alice(`/api/game/${game.id}/answer`, { text: 'zzzz introuvable' });
    assert.equal(res.data.result, 'unknown');
    res = await alice(`/api/game/${game.id}/answer`, { text: answerFor(app.db, game.id, 5) });
    assert.equal(res.data.result, 'ok');
    const firstPoints = res.data.round.points;
    assert.ok(firstPoints >= 68, `réponse rare : ${firstPoints} pts`);

    // Thème 2 : chrono dépassé → 0 point.
    await alice(`/api/game/${game.id}/reveal`, {});
    app.clock.now += 40_000;
    res = await alice(`/api/game/${game.id}/answer`, { text: answerFor(app.db, game.id, 1) });
    assert.equal(res.data.result, 'timeout');
    assert.equal(res.data.round.points, 0);

    // Thème 3 : passé.
    await alice(`/api/game/${game.id}/reveal`, {});
    res = await alice(`/api/game/${game.id}/skip`, {});
    assert.equal(res.data.result, 'skip');

    // Thèmes 4 à 7 : réponses évidentes.
    for (let i = 3; i < 7; i++) {
      await alice(`/api/game/${game.id}/reveal`, {});
      res = await alice(`/api/game/${game.id}/answer`, { text: answerFor(app.db, game.id, 1) });
      assert.equal(res.data.round.points, 10);
    }
    assert.equal(res.data.state.finished, true);
    assert.equal(res.data.state.score, firstPoints + 40);

    // Une seule partie quotidienne : relancer renvoie la même.
    const again = (await alice('/api/game/start', { mode: 'daily' })).data;
    assert.equal(again.id, game.id);
    assert.equal(again.finished, true);

    // Bob reçoit les mêmes thèmes ; la pépite d'Alice n'en est plus une pour lui.
    const bobGame = (await bob('/api/game/start', { mode: 'daily' })).data;
    const bobState = (await bob(`/api/game/${bobGame.id}/reveal`, {})).data;
    assert.equal(bobState.rounds[0].title, again.rounds[0].title);
    const bobRes = await bob(`/api/game/${bobGame.id}/answer`, { text: again.rounds[0].answer });
    assert.ok(bobRes.data.round.points < firstPoints);

    // Statistiques de fin de partie : scores du jour (anonymes) et réponses du thème.
    const finished = (await alice(`/api/game/${game.id}`)).data;
    assert.deepEqual(finished.dayScores, [firstPoints + 40]);
    assert.equal(finished.rounds[0].othersCount, 1, 'Bob a donné la même réponse');
    const answers = (await alice(`/api/game/${game.id}/answers?slot=0`)).data;
    assert.equal(answers.title, finished.rounds[0].title);
    const mine = answers.answers.find((a) => a.mine);
    assert.equal(mine.label, finished.rounds[0].answer);
    assert.equal(mine.count, 2);
    assert.ok(answers.answers.every((a, i, all) => i === 0 || all[i - 1].points <= a.points), 'du plus évident au plus rare');
    assert.equal((await bob(`/api/game/${bobGame.id}/answers?slot=0`)).status, 409, 'pas avant la fin de la partie');

    // Bob ne peut pas voir la partie d'Alice.
    assert.equal((await bob(`/api/game/${game.id}`)).status, 404);

    // Podium de la semaine.
    const board = (await bob('/api/leaderboard')).data;
    assert.equal(board.start, '2026-10-12');
    assert.equal(board.end, '2026-10-18');
    assert.equal(board.entries[0].username, 'alice');
    assert.equal(board.entries[0].score, firstPoints + 40);
    assert.equal(board.me.username, 'bob');
    assert.equal(board.me.rank, 2);

    // Le lendemain, nouveaux thèmes ; la semaine suivante, nouveau podium.
    app.clock.now += 24 * 3600 * 1000;
    const tomorrow = (await alice('/api/game/start', { mode: 'daily' })).data;
    assert.notEqual(tomorrow.id, game.id);
    app.clock.now += 6 * 24 * 3600 * 1000;
    const nextWeek = (await alice('/api/leaderboard')).data;
    assert.equal(nextWeek.start, '2026-10-19');
    assert.equal(nextWeek.entries.length, 0);
    const lastWeek = (await alice('/api/leaderboard?week=2026-10-12')).data;
    assert.equal(lastWeek.entries[0].score, firstPoints + 40);

    // Podiums du jour et du mois.
    const day = (await alice('/api/leaderboard?period=day&date=2026-10-14')).data;
    assert.equal(day.entries.length, 2);
    assert.equal(day.prev, '2026-10-13');
    assert.equal(day.next, '2026-10-15');
    const month = (await alice('/api/leaderboard?period=month')).data;
    assert.deepEqual([month.start, month.end, month.prev, month.next], ['2026-10-01', '2026-10-31', '2026-09-01', null]);
    assert.equal(month.entries.find((e) => e.username === 'alice').score, firstPoints + 40);
    assert.equal((await alice('/api/leaderboard?period=year')).status, 400);
  } finally {
    await app.close();
  }
});

test("l'entraînement ne compte ni pour le podium ni pour les statistiques", async () => {
  const app = await startServer();
  try {
    const carol = client(app.base);
    await carol('/api/signup', { username: 'carol', password: 'secret123' });
    const daily = (await carol('/api/game/start', { mode: 'daily' })).data;
    const dailyThemes = app.db.prepare('SELECT theme_id FROM rounds WHERE game_id = ?').all(daily.id).map((r) => r.theme_id);

    const training = (await carol('/api/game/start', { mode: 'training' })).data;
    assert.equal(training.mode, 'training');
    const trainingThemes = app.db.prepare('SELECT theme_id FROM rounds WHERE game_id = ?').all(training.id).map((r) => r.theme_id);
    assert.ok(trainingThemes.every((t) => !dailyThemes.includes(t)), "pas d'entraînement sur les thèmes du jour");

    await carol(`/api/game/${training.id}/reveal`, {});
    const res = await carol(`/api/game/${training.id}/answer`, { text: answerFor(app.db, training.id, 3) });
    assert.equal(res.data.result, 'ok');
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM answer_counts').get().n, 0);
    assert.equal((await carol('/api/leaderboard')).data.entries.length, 1); // seulement la partie du jour (0 pt)
  } finally {
    await app.close();
  }
});

test('derrière Cloudflare, la limite d’inscriptions vaut par joueur et non pour tout le proxy', async () => {
  const app = await startServer({ clientIpHeader: 'cf-connecting-ip' });
  const signup = (n, ip) =>
    fetch(`${app.base}/api/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.0.0.1', 'CF-Connecting-IP': ip },
      body: JSON.stringify({ username: `joueur${n}`, password: 'secret123' }),
    });
  try {
    for (let n = 0; n < 11; n++) assert.equal((await signup(n, `203.0.113.${n}`)).status, 201);
    for (let n = 11; n < 21; n++) assert.equal((await signup(n, '198.51.100.7')).status, 201);
    assert.equal((await signup(21, '198.51.100.7')).status, 429);
  } finally {
    await app.close();
  }
});

test('sans Cloudflare, un en-tête inventé ne contourne pas la limite ; seule la dernière adresse du proxy compte', async () => {
  const app = await startServer();
  const signup = (n, headers) =>
    fetch(`${app.base}/api/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ username: `visiteur${n}`, password: 'secret123' }),
    });
  try {
    // Le visiteur invente CF-Connecting-IP et le début de X-Forwarded-For ; le proxy ajoute 198.51.100.9.
    for (let n = 0; n < 10; n++) {
      const res = await signup(n, { 'CF-Connecting-IP': `203.0.113.${n}`, 'X-Forwarded-For': `192.0.2.${n}, 198.51.100.9` });
      assert.equal(res.status, 201);
    }
    assert.equal((await signup(10, { 'CF-Connecting-IP': '203.0.113.99', 'X-Forwarded-For': '192.0.2.99, 198.51.100.9' })).status, 429);
  } finally {
    await app.close();
  }
});

test('une saisie approximative est proposée au joueur avant d’être validée', async () => {
  const app = await startServer();
  try {
    const dan = client(app.base);
    await dan('/api/signup', { username: 'dan', password: 'secret123' });
    const { data: game } = await dan('/api/game/start', { mode: 'daily' });
    // Thème fixé : le test ne doit pas dépendre du tirage du jour.
    app.db.prepare("UPDATE rounds SET theme_id = 'wallonie' WHERE game_id = ? AND slot = 0").run(game.id);
    await dan(`/api/game/${game.id}/reveal`, {});
    const round = app.db.prepare('SELECT theme_id FROM rounds WHERE game_id = ? AND slot = 0').get(game.id);
    const theme = THEMES.get(round.theme_id);
    // Une lettre doublée : reconnu, mais seulement après confirmation.
    const typoOf = (a) => `${a.label}${a.label.slice(-1)}`;
    const target = theme.answers.find((a) => {
      const m = a.key.length >= 9 && /^[a-z]+[^sx]$/.test(a.key) && matchAnswer(theme, typoOf(a));
      return m && m.approximate && m.answer === a;
    });
    const typo = typoOf(target);

    let res = await dan(`/api/game/${game.id}/answer`, { text: typo });
    assert.equal(res.data.result, 'confirm');
    assert.equal(res.data.suggestion, target.label);
    assert.equal(res.data.state.rounds[0].status, 'active', 'rien n’est validé tant que le joueur n’a pas confirmé');

    // Refusée : comptée comme réponse inconnue, le joueur peut réessayer.
    res = await dan(`/api/game/${game.id}/answer`, { text: typo, reject: true });
    assert.equal(res.data.result, 'unknown');
    assert.equal(app.db.prepare('SELECT n FROM unknown_answers WHERE theme_id = ?').get(round.theme_id).n, 1);

    // Une confirmation pour une autre réponse que celle proposée ne valide rien.
    res = await dan(`/api/game/${game.id}/answer`, { text: typo, accept: 'autre chose' });
    assert.equal(res.data.result, 'confirm');

    res = await dan(`/api/game/${game.id}/answer`, { text: typo, accept: target.label });
    assert.equal(res.data.result, 'ok');
    assert.equal(res.data.round.answer, target.label);
    assert.equal(res.data.round.input, typo);
  } finally {
    await app.close();
  }
});

test('une réponse refusée peut être signalée, et le responsable du jeu voit les signalements', async () => {
  const app = await startServer();
  try {
    const admin = client(app.base);
    const eve = client(app.base);
    await admin('/api/signup', { username: 'chef', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    assert.equal((await admin('/api/me')).data.isAdmin, true, 'premier compte créé');
    assert.equal((await eve('/api/me')).data.isAdmin, false);

    const { data: game } = await eve('/api/game/start', { mode: 'daily' });
    // Pas de signalement sur un thème pas encore révélé.
    assert.equal((await eve(`/api/game/${game.id}/report`, { text: 'Bruce tout-puissant' })).status, 404);
    await eve(`/api/game/${game.id}/reveal`, {});
    assert.equal((await eve(`/api/game/${game.id}/answer`, { text: 'Bobby seul contre tous' })).data.result, 'unknown');
    let res = await eve(`/api/game/${game.id}/report`, { text: 'Bobby seul contre tous' });
    assert.deepEqual(res.data, { status: 'recorded' });
    // Signaler deux fois ne compte qu'une fois ; une réponse déjà connue est indiquée comme telle.
    await eve(`/api/game/${game.id}/report`, { text: 'bobby  seul contre tous' });
    res = await eve(`/api/game/${game.id}/report`, { text: answerFor(app.db, game.id, 1) });
    assert.equal(res.data.status, 'known');
    // Le thème continue : le signalement ne clôt pas la manche.
    assert.equal((await eve(`/api/game/${game.id}`)).data.rounds[0].status, 'active');

    assert.equal((await eve('/api/admin/reports')).status, 403);
    const { reports } = (await admin('/api/admin/reports')).data;
    assert.equal(reports.length, 1);
    assert.equal(reports[0].input, 'Bobby seul contre tous');
    assert.equal(reports[0].players, 1);
    assert.equal(reports[0].status, 'pending');
    await admin('/api/admin/reports/handled', { themeId: reports[0].themeId, inputKey: reports[0].inputKey });
    assert.equal((await admin('/api/admin/reports')).data.reports[0].status, 'handled');
  } finally {
    await app.close();
  }
});

test('point de contrôle pour l’hébergeur', async () => {
  const app = await startServer();
  try {
    const res = await fetch(`${app.base}/api/health`);
    assert.equal(res.status, 200);
    // Empreinte de l'interface, pour que les pages ouvertes repèrent une mise à jour.
    assert.match(res.headers.get('x-app-version'), /^[0-9a-f]{12}$/);
    assert.deepEqual(await res.json(), { ok: true });
  } finally {
    await app.close();
  }
});

test('une réponse signalée puis ajoutée au thème rapporte ses points au joueur, dans la semaine en cours', async () => {
  // Thèmes copiés : on peut y ajouter une réponse comme le ferait une mise à jour des fichiers.
  const themes = new Map([...THEMES].map(([id, t]) => [id, { ...t, answers: [...t.answers], index: new Map(t.index) }]));
  const app = await startServer({ themes });
  try {
    const admin = client(app.base);
    const gus = client(app.base);
    await admin('/api/signup', { username: 'chef', password: 'secret123' });
    await gus('/api/signup', { username: 'gus', password: 'secret123' });
    const { data: game } = await gus('/api/game/start', { mode: 'daily' });
    await gus(`/api/game/${game.id}/reveal`, {});
    const round = app.db.prepare('SELECT theme_id FROM rounds WHERE game_id = ? AND slot = 0').get(game.id);
    const theme = themes.get(round.theme_id);

    await gus(`/api/game/${game.id}/answer`, { text: 'Réponse oubliée du fichier' });
    await gus(`/api/game/${game.id}/report`, { text: 'Réponse oubliée du fichier' });
    await gus(`/api/game/${game.id}/skip`, {});
    // Signalée après coup, depuis la liste du thème : ne donne jamais de points.
    await gus(`/api/game/${game.id}/report`, { slot: 0, text: 'Autre oubli' });

    // Signalement fait avant que la manche soit retenue (ancienne version) : retrouvée par l'heure.
    app.db.prepare('UPDATE answer_reports SET game_id = NULL, slot = NULL').run();
    const add = (label) => {
      const key = toKey(label);
      const answer = { key, label, level: 5, weight: LEVEL_WEIGHTS[5] };
      theme.answers.push(answer);
      theme.index.set(key, answer);
      theme.weightTotal += answer.weight;
    };
    add('Réponse oubliée du fichier');
    add('Autre oubli');
    const before = (await gus(`/api/game/${game.id}`)).data;
    assert.equal(before.rounds[0].points, 0);

    const { reports } = (await admin('/api/admin/reports')).data; // déclenche l'attribution
    assert.equal(reports.find((r) => r.input === 'Réponse oubliée du fichier').credited, 1);
    assert.equal(reports.find((r) => r.input === 'Autre oubli').credited, 0);
    const after = (await gus(`/api/game/${game.id}`)).data;
    assert.ok(after.rounds[0].points >= 10, `points accordés : ${after.rounds[0].points}`);
    assert.equal(after.rounds[0].answer, 'Réponse oubliée du fichier');
    assert.equal(after.score, after.rounds[0].points);
    assert.equal(app.db.prepare('SELECT n FROM answer_counts WHERE theme_id = ? AND answer_key = ?').get(theme.id, toKey('Réponse oubliée du fichier')).n, 1);
    // Une seule attribution, même si on relance.
    await admin('/api/admin/reports');
    assert.equal((await gus(`/api/game/${game.id}`)).data.score, after.score);

    // Semaine terminée : plus de points pour un signalement validé après coup.
    const { data: game2 } = await gus('/api/game/start', { mode: 'training' });
    await gus(`/api/game/${game2.id}/reveal`, {});
    await gus(`/api/game/${game2.id}/answer`, { text: 'zzz entraînement' });
    const r2 = await gus(`/api/game/${game2.id}/report`, { text: 'zzz entraînement' });
    assert.equal(r2.data.status, 'recorded');
    const training = themes.get(app.db.prepare('SELECT theme_id FROM rounds WHERE game_id = ? AND slot = 0').get(game2.id).theme_id);
    const key = toKey('zzz entraînement');
    const a = { key, label: 'Zzz entraînement', level: 1, weight: LEVEL_WEIGHTS[1] };
    training.answers.push(a);
    training.index.set(key, a);
    await admin('/api/admin/reports');
    assert.equal(app.db.prepare("SELECT credit FROM answer_reports WHERE input_key = ?").get(key).credit, 'ineligible', 'pas de points en entraînement');
  } finally {
    await app.close();
  }
});
