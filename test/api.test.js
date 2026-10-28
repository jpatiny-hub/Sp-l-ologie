'use strict';

const test = require('node:test');
const { NEWS } = require('../src/news');
const assert = require('node:assert/strict');
const { matchAnswer, toKey } = require('../src/matching');
const { LEVEL_WEIGHTS } = require('../src/scoring');
const { THEMES, startServer, client, answerFor, playDaily } = require('./helpers');

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
    const titleBefore = res.data.state.rounds[2].title;
    res = await alice(`/api/game/${game.id}/skip`, {});
    assert.equal(res.data.result, 'joker', 'le premier passage est un joker : le thème est remplacé');
    assert.notEqual(res.data.round.title, titleBefore);
    assert.equal(res.data.state.joker.used, true);
    assert.equal(res.data.state.rounds[2].status, 'active', 'le chrono repart sur le thème de remplacement');
    res = await alice(`/api/game/${game.id}/skip`, {});
    assert.equal(res.data.result, 'skip', 'le second passage coûte le thème');

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

test('une réponse signalée puis ajoutée au thème ne rapporte rien tant que le responsable ne le décide pas', async () => {
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
    const theme = themes.get(app.db.prepare('SELECT theme_id FROM rounds WHERE game_id = ? AND slot = 0').get(game.id).theme_id);
    const input = 'Réponse oubliée du fichier';
    const key = toKey(input);

    await gus(`/api/game/${game.id}/answer`, { text: input });
    await gus(`/api/game/${game.id}/report`, { text: input }); // pendant la manche
    app.db.prepare('UPDATE games SET joker_used = 1').run();
    await gus(`/api/game/${game.id}/skip`, {});
    app.clock.now += 60 * 1000;
    await gus(`/api/game/${game.id}/report`, { slot: 0, text: 'Autre oubli' }); // après coup

    const credit = (c, text) => c('/api/admin/reports/credit', { themeId: theme.id, inputKey: toKey(text), username: 'gus' });
    assert.equal((await credit(gus, input)).status, 403, 'réservé au responsable');
    assert.equal((await credit(admin, input)).status, 409, 'la réponse doit d\'abord figurer dans le thème');

    for (const label of [input, 'Autre oubli']) {
      const k = toKey(label);
      const answer = { key: k, label, level: 5, weight: LEVEL_WEIGHTS[5] };
      theme.answers.push(answer);
      theme.index.set(k, answer);
      theme.weightTotal += answer.weight;
    }

    // Même ajoutée au thème, une réponse signalée reste « à vérifier » et ne donne aucun point toute seule.
    const { reports } = (await admin('/api/admin/reports')).data;
    for (const r of reports) {
      assert.equal(r.status, 'pending');
      assert.equal(r.credited, 0);
      assert.ok(r.inTheme);
    }
    assert.equal((await gus(`/api/game/${game.id}`)).data.rounds[0].points, 0);
    assert.equal((await gus(`/api/game/${game.id}`)).data.score, 0);

    // Le responsable accorde les points d'un signalement précis.
    const res = await credit(admin, input);
    assert.equal(res.status, 200);
    const after = (await gus(`/api/game/${game.id}`)).data;
    assert.equal(after.rounds[0].points, res.data.points);
    assert.equal(after.rounds[0].answer, input);
    assert.equal(after.score, res.data.points);
    assert.equal(app.db.prepare('SELECT n FROM answer_counts WHERE theme_id = ? AND answer_key = ?').get(theme.id, key).n, 1);
    assert.equal((await credit(admin, input)).status, 409, 'une seule fois');
    // L'autre signalement vise la même manche, désormais répondue : rien à accorder.
    assert.equal((await credit(admin, 'Autre oubli')).status, 409);
    const listed = (await admin('/api/admin/reports')).data.reports;
    assert.equal(listed.find((r) => r.input === input).credited, 1);
    assert.equal(listed.find((r) => r.input === input).status, 'pending', 'jamais traité automatiquement');

    // Entraînement : aucun point possible.
    const { data: game2 } = await gus('/api/game/start', { mode: 'training' });
    await gus(`/api/game/${game2.id}/reveal`, {});
    await gus(`/api/game/${game2.id}/answer`, { text: 'zzz entraînement' });
    assert.equal((await gus(`/api/game/${game2.id}/report`, { text: 'zzz entraînement' })).data.status, 'recorded');
    const training = themes.get(app.db.prepare('SELECT theme_id FROM rounds WHERE game_id = ? AND slot = 0').get(game2.id).theme_id);
    const tk = toKey('zzz entraînement');
    const a = { key: tk, label: 'Zzz entraînement', level: 1, weight: LEVEL_WEIGHTS[1] };
    training.answers.push(a);
    training.index.set(tk, a);
    const res2 = await admin('/api/admin/reports/credit', { themeId: training.id, inputKey: tk, username: 'gus' });
    assert.equal(res2.status, 409);
  } finally {
    await app.close();
  }
});

test('proposition de thèmes : tous les joueurs peuvent proposer, seul le responsable les voit', async () => {
  const app = await startServer();
  try {
    const admin = client(app.base);
    const eve = client(app.base);
    await admin('/api/signup', { username: 'chef', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    assert.equal((await client(app.base)('/api/themes/suggest', { title: 'Un instrument à vent' })).status, 401);
    assert.equal((await eve('/api/themes/suggest', { title: 'abc' })).status, 400, 'titre trop court');
    assert.equal((await eve('/api/themes/suggest', { title: 'Un instrument à vent', details: 'flûte, hautbois…' })).status, 201);

    const mine = (await eve('/api/themes/suggestions')).data.suggestions;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].handled, false);
    assert.equal((await eve('/api/admin/theme-suggestions')).status, 403);

    const { suggestions } = (await admin('/api/admin/theme-suggestions')).data;
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].username, 'eve');
    assert.equal(suggestions[0].details, 'flûte, hautbois…');
    assert.equal((await eve('/api/admin/theme-suggestions/handled', { id: suggestions[0].id })).status, 403);
    await admin('/api/admin/theme-suggestions/handled', { id: suggestions[0].id });
    assert.equal((await admin('/api/admin/theme-suggestions')).data.suggestions[0].handled, true);
    assert.equal((await eve('/api/themes/suggestions')).data.suggestions[0].handled, true);

    // Au plus 5 propositions par jour et par joueur.
    for (let i = 0; i < 4; i++) await eve('/api/themes/suggest', { title: `Idée numéro ${i}` });
    assert.equal((await eve('/api/themes/suggest', { title: 'Une de trop' })).status, 429);
  } finally {
    await app.close();
  }
});

test("note de mise à jour : vue une fois par les anciens comptes, pas par les nouveaux", async () => {
  const app = await startServer();
  try {
    const alice = client(app.base);
    await alice('/api/signup', { username: 'alice', password: 'secret123' });
    assert.deepEqual((await alice('/api/me')).data.news, [], 'un compte neuf ne voit pas les notes déjà publiées');

    // Ancien compte : la note n'a jamais été vue.
    app.db.prepare('UPDATE users SET news_seen = 0').run();
    const news = (await alice('/api/me')).data.news;
    assert.equal(news.length, NEWS.length);
    assert.match(news[0].items.join(' '), /Proposer un thème/);
    assert.equal((await alice('/api/news/seen', { id: 'x' })).status, 400);
    await alice('/api/news/seen', { id: news[news.length - 1].id });
    assert.deepEqual((await alice('/api/me')).data.news, []);
  } finally {
    await app.close();
  }
});

test('ajustement manuel : le responsable rend les points d\'une réponse signalée après coup', async () => {
  const themes = new Map([...THEMES].map(([id, t]) => [id, { ...t, answers: [...t.answers], index: new Map(t.index) }]));
  const app = await startServer({ themes });
  try {
    const admin = client(app.base);
    const gus = client(app.base);
    await admin('/api/signup', { username: 'chef', password: 'secret123' });
    await gus('/api/signup', { username: 'gus', password: 'secret123' });
    const { data: game } = await gus('/api/game/start', { mode: 'daily' });
    await gus(`/api/game/${game.id}/reveal`, {});
    app.db.prepare('UPDATE games SET joker_used = 1').run();
    await gus(`/api/game/${game.id}/skip`, {});
    app.clock.now += 60 * 1000;
    const themeId = app.db.prepare('SELECT theme_id FROM rounds WHERE game_id = ? AND slot = 0').get(game.id).theme_id;
    await gus(`/api/game/${game.id}/report`, { slot: 0, text: 'Oubli signalé trop tard' });
    const credit = (c) => c('/api/admin/reports/credit', { themeId, inputKey: toKey('Oubli signalé trop tard'), username: 'GUS' });

    assert.equal((await credit(gus)).status, 403, 'réservé au responsable');
    assert.equal((await credit(admin)).status, 409, 'la réponse doit d\'abord être dans le thème');

    const theme = themes.get(themeId);
    const key = toKey('Oubli signalé trop tard');
    const answer = { key, label: 'Oubli signalé trop tard', level: 5, weight: LEVEL_WEIGHTS[5] };
    theme.answers.push(answer);
    theme.index.set(key, answer);
    theme.weightTotal += answer.weight;

    const { reports } = (await admin('/api/admin/reports')).data;
    const report = reports.find((r) => r.input === 'Oubli signalé trop tard');
    assert.equal(report.credited, 0, 'signalé après la manche : pas d\'attribution automatique');
    assert.equal(report.reporters[0].username, 'gus');
    assert.ok(report.reporters[0].creditableDay);

    const res = await credit(admin);
    assert.equal(res.status, 200);
    const after = (await gus(`/api/game/${game.id}`)).data;
    assert.equal(after.rounds[0].points, res.data.points);
    assert.equal(after.rounds[0].answer, 'Oubli signalé trop tard');
    assert.equal(after.score, res.data.points);
    assert.equal((await credit(admin)).status, 409, 'une seule fois');
    assert.equal((await admin('/api/admin/reports')).data.reports.find((r) => r.input === 'Oubli signalé trop tard').credited, 1);
  } finally {
    await app.close();
  }
});

test('ajustement manuel d\'une faute : le responsable désigne la réponse visée, sans changer les règles ; le joueur voit le retour', async () => {
  const app = await startServer();
  try {
    const admin = client(app.base);
    const gus = client(app.base);
    await admin('/api/signup', { username: 'chef', password: 'secret123' });
    await gus('/api/signup', { username: 'gus', password: 'secret123' });
    const { data: game } = await gus('/api/game/start', { mode: 'daily' });
    await gus(`/api/game/${game.id}/reveal`, {});
    app.db.prepare('UPDATE games SET joker_used = 1').run();
    await gus(`/api/game/${game.id}/skip`, {});
    app.clock.now += 60 * 1000;
    const themeId = app.db.prepare('SELECT theme_id FROM rounds WHERE game_id = ? AND slot = 0').get(game.id).theme_id;
    const typo = 'zzqx wvut';
    await gus(`/api/game/${game.id}/report`, { slot: 0, text: typo });
    const inputKey = toKey(typo);
    const credit = (answerKey) => admin('/api/admin/reports/credit', { themeId, inputKey, username: 'gus', answerKey });

    const report = (await admin('/api/admin/reports')).data.reports.find((r) => r.input === typo);
    assert.equal(report.inTheme, null);
    assert.ok(report.reporters[0].creditableDay, 'proposé même si la saisie n\'est pas reconnue');
    assert.equal((await credit()).status, 409, 'sans réponse désignée');
    assert.equal((await credit('inconnue')).status, 409);

    const { answers } = (await admin(`/api/admin/theme-answers?themeId=${themeId}`)).data;
    assert.ok(answers.length >= 20);
    const res = await credit(answers[0].key);
    assert.equal(res.status, 200);
    const after = (await gus(`/api/game/${game.id}`)).data;
    assert.equal(after.rounds[0].points, res.data.points);
    assert.equal(after.rounds[0].answer, answers[0].label);
    assert.equal((await credit(answers[0].key)).status, 409, 'une seule fois');
    // Les règles ne changent pas : la saisie n'est toujours pas reconnue par le thème.
    assert.equal((await admin('/api/admin/reports')).data.reports.find((r) => r.input === typo).inTheme, null);

    // Retour du responsable.
    assert.equal((await gus('/api/admin/reports/reply', { themeId, inputKey, verdict: 'accepted', message: 'x' })).status, 403);
    assert.equal((await admin('/api/admin/reports/reply', { themeId, inputKey, verdict: 'peut-être' })).status, 400);
    const mine0 = (await gus('/api/reports/mine')).data;
    assert.equal(mine0.unread, 1, 'les points accordés comptent comme un retour non lu');
    assert.equal(mine0.reports[0].points, res.data.points);
    await admin('/api/admin/reports/reply', { themeId, inputKey, verdict: 'refused', message: 'Trop éloigné.' });
    await admin('/api/admin/reports/reply', { themeId, inputKey, verdict: 'accepted', message: 'Faute tolérée, points accordés.' });
    const mine = (await gus('/api/reports/mine')).data;
    assert.equal(mine.reports[0].verdict, 'accepted');
    assert.equal(mine.reports[0].message, 'Faute tolérée, points accordés.');
    assert.equal(mine.reports[0].status, 'handled');
    assert.equal(mine.unread, 1);
    await gus('/api/reports/mine/seen', {});
    assert.equal((await gus('/api/reports/mine')).data.unread, 0);
    assert.equal((await admin('/api/admin/reports')).data.reports[0].reply.verdict, 'accepted');
  } finally {
    await app.close();
  }
});

test('changement de pseudo : mot de passe demandé, pas de doublon, un changement par semaine', async () => {
  const app = await startServer();
  try {
    const chef = client(app.base);
    const eve = client(app.base);
    await chef('/api/signup', { username: 'chef', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    const rename = (c, username, password = 'secret123') => c('/api/profile/rename', { username, password });

    assert.equal((await rename(eve, 'Eve2', 'mauvais')).status, 401, 'mauvais mot de passe');
    assert.equal((await rename(eve, 'Chef')).status, 409, 'pseudo déjà pris, casse ignorée');
    assert.equal((await rename(eve, 'x')).status, 400, 'pseudo trop court');
    const ok = await rename(eve, 'Eve2');
    assert.equal(ok.status, 200);
    assert.equal(ok.data.user.username, 'Eve2');
    assert.equal((await eve('/api/me')).data.user.username, 'Eve2');
    assert.equal((await rename(eve, 'Eve3')).status, 429, 'un seul changement par semaine');
    app.clock.now += 6 * 24 * 3600 * 1000;
    assert.equal((await rename(eve, 'Eve3')).status, 429);
    app.clock.now += 2 * 24 * 3600 * 1000;
    assert.equal((await rename(eve, 'Eve3')).status, 200);
    // L'ancien pseudo est libre, et la connexion se fait avec le nouveau.
    const other = client(app.base);
    assert.equal((await other('/api/login', { username: 'eve', password: 'secret123' })).status, 401);
    assert.equal((await other('/api/login', { username: 'eve3', password: 'secret123' })).status, 200);
  } finally {
    await app.close();
  }
});

test('avatar : valeurs par défaut, éléments à débloquer, visible dans les classements', async () => {
  const app = await startServer();
  try {
    const chef = client(app.base);
    await chef('/api/signup', { username: 'chef', password: 'secret123' });
    const me = (await chef('/api/me')).data;
    assert.equal(me.avatar.chapeau, 'casque');
    const profile = (await chef('/api/profile')).data;
    const lockedHat = profile.avatarCatalog.chapeau.options.find((o) => o.id === 'couronne');
    assert.equal(lockedHat.unlocked, false);
    assert.match(lockedHat.hint, /Badge|badges/);

    assert.equal((await chef('/api/profile/avatar', { avatar: { ...me.avatar, chapeau: 'couronne' } })).status, 403, 'élément verrouillé');
    assert.equal((await chef('/api/profile/avatar', { avatar: { ...me.avatar, chapeau: 'inconnu' } })).status, 403);
    const mine = { ...me.avatar, forme: 'f', chapeau: 'diademe', tenue: 'robe', objet: 'fleur', lieu: 'surface' };
    assert.equal((await chef('/api/profile/avatar', { avatar: mine })).status, 200);
    assert.deepEqual((await chef('/api/me')).data.avatar, mine);

    // Un badge de défi débloque le fanion.
    const uid = app.db.prepare("SELECT id FROM users WHERE username = 'chef'").get().id;
    app.db.prepare("INSERT INTO badges (user_id, kind, instance, earned_on, created_at) VALUES (?, 'defi-1', '1', '2026-10-14', 0)").run(uid);
    assert.equal((await chef('/api/profile/avatar', { avatar: { ...mine, objet: 'fanion' } })).status, 200);

    await playDaily(app, chef, 1);
    const board = (await chef('/api/leaderboard?period=week')).data;
    assert.equal(board.entries[0].avatar.objet, 'fanion');
    const cmp = (await chef(`/api/compare?date=2026-10-14`)).data;
    assert.equal(cmp.players[0].avatar.tenue, 'robe');
  } finally {
    await app.close();
  }
});

test('défis de la semaine : score cumulé, réponses Soufre et parties illimitées', async () => {
  const { challengeFor, CHALLENGES } = require('../src/challenges');
  assert.equal(challengeFor('2026-10-19').id, 'regulier', 'la semaine en cours garde son défi');
  const ids = new Set();
  for (let d = Date.UTC(2026, 9, 26); ids.size < CHALLENGES.length && d < Date.UTC(2027, 3, 1); d += 7 * 86400000) {
    ids.add(challengeFor(new Date(d).toISOString().slice(0, 10)).id);
  }
  for (const id of ['gravier', 'soufre', 'cuivre', 'rubis', 'score', 'illimite', 'forage450', 'rapides', 'weekend']) assert.ok(ids.has(id), `${id} apparaît dans la rotation`);
  const app = await startServer();
  try {
    const chef = client(app.base);
    await chef('/api/signup', { username: 'chef', password: 'secret123' });
    await playDaily(app, chef, 1);
    await playDaily(app, chef, 1, 'training');
    const { weekStats } = require('../src/challenges');
    const stats = weekStats(app.db, app.db.prepare('SELECT id FROM users').get().id, '2026-10-12');
    assert.equal(stats.illimite, 1);
    assert.ok(stats.score > 0);
    assert.equal(stats.best, stats.score, 'un seul forage dans la semaine');
    for (const k of ['gravier', 'soufre', 'cuivre', 'rubis', 'rapides', 'weekend']) assert.ok(Number.isInteger(stats[k]) && stats[k] >= 0, k);
  } finally {
    await app.close();
  }
});

test('joker : un thème de remplacement commun à tous, en forage du jour comme en entraînement', async () => {
  const app = await startServer();
  try {
    const chef = client(app.base);
    const eve = client(app.base);
    await chef('/api/signup', { username: 'chef', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    const swap = async (c) => {
      const { data: game } = await c('/api/game/start', { mode: 'daily' });
      assert.equal((await c(`/api/game/${game.id}/reveal`, {})).data.joker.available, true);
      const res = await c(`/api/game/${game.id}/skip`, {});
      assert.equal(res.data.result, 'joker');
      assert.equal(res.data.state.joker.available, false);
      assert.equal(res.data.state.joker.used, true);
      return { game, title: res.data.round.title, themeId: app.db.prepare('SELECT theme_id FROM rounds WHERE game_id = ? AND slot = 0').get(game.id).theme_id };
    };
    const a = await swap(chef);
    const b = await swap(eve);
    assert.equal(a.themeId, b.themeId, 'le même thème de remplacement pour tout le monde');
    const day = app.db.prepare("SELECT day FROM games WHERE id = ?").get(a.game.id).day;
    assert.ok(!app.db.prepare('SELECT 1 FROM daily_themes WHERE day = ? AND theme_id = ?').get(day, a.themeId), 'le thème de remplacement ne fait pas partie des 7 thèmes du jour');
    // Le thème remplacé reste connu (pour les statistiques) et un seul joker est accordé.
    assert.ok(app.db.prepare('SELECT swapped_from FROM rounds WHERE game_id = ? AND slot = 0').get(a.game.id).swapped_from);
    // Entraînement : même principe, avec un thème de remplacement propre à la partie.
    const { data: tr } = await chef('/api/game/start', { mode: 'training' });
    await chef(`/api/game/${tr.id}/reveal`, {});
    const t = await chef(`/api/game/${tr.id}/skip`, {});
    assert.equal(t.data.result, 'joker');
    await chef(`/api/game/${tr.id}/reveal`, {});
    assert.equal((await chef(`/api/game/${tr.id}/skip`, {})).data.result, 'skip');
  } finally {
    await app.close();
  }
});

test('comparaison : la galerie de secours apparaît sur le thème remplacé, et le thème de remplacement forme une rubrique à part', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base);
    const eve = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    const play = async (c, useJoker) => {
      const { data: game } = await c('/api/game/start', { mode: 'daily' });
      for (let i = 0; i < 7; i++) {
        if (!(useJoker && i === 1 && (await c(`/api/game/${game.id}/skip`, {})).data.result === 'joker')) {
          await c(`/api/game/${game.id}/reveal`, {});
        }
        await c(`/api/game/${game.id}/answer`, { text: answerFor(app.db, game.id, 1) });
      }
    };
    await adam('/api/game/start', { mode: 'daily' });
    await play(eve, false);
    const adamGame = (await adam('/api/game/start', { mode: 'daily' })).data;
    // Adam : thème 1 normal, thème 2 remplacé par la galerie de secours.
    await adam(`/api/game/${adamGame.id}/reveal`, {});
    await adam(`/api/game/${adamGame.id}/answer`, { text: answerFor(app.db, adamGame.id, 1) });
    await adam(`/api/game/${adamGame.id}/reveal`, {});
    assert.equal((await adam(`/api/game/${adamGame.id}/skip`, {})).data.result, 'joker');
    await adam(`/api/game/${adamGame.id}/answer`, { text: answerFor(app.db, adamGame.id, 1) });
    for (let i = 2; i < 7; i++) {
      await adam(`/api/game/${adamGame.id}/reveal`, {});
      await adam(`/api/game/${adamGame.id}/answer`, { text: answerFor(app.db, adamGame.id, 1) });
    }
    const data = (await adam('/api/compare?date=2026-10-14')).data;
    assert.equal(data.themes.length, 8, '7 thèmes du jour + la rubrique de la galerie de secours');
    assert.equal(data.themes[7].spare, true);
    const a = data.players.find((p) => p.me);
    const e = data.players.find((p) => !p.me);
    const swapped = a.rounds.find((r) => r.outcome === 'joker');
    assert.ok(swapped, 'le thème remplacé est signalé comme galerie de secours');
    assert.equal(swapped.themeId, data.themes[1].themeId);
    assert.equal(a.rounds.filter((r) => r.spare).length, 1);
    assert.equal(e.rounds.filter((r) => r.spare || r.outcome === 'joker').length, 0, 'Eve n a pas utilisé la galerie');
    assert.equal(a.rounds.length, 8);
    assert.equal(e.rounds.length, 7);
  } finally {
    await app.close();
  }
});

test('tutoriel : proposé aux nouveaux comptes et aux comptes existants (une fois), marqué comme vu', async () => {
  const app = await startServer();
  try {
    const eve = client(app.base);
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    assert.equal((await eve('/api/me')).data.tutorialSeen, false);
    assert.equal((await eve('/api/tutorial/seen', {})).status, 200);
    assert.equal((await eve('/api/me')).data.tutorialSeen, true);
    // Migration : les joueurs déjà inscrits verront le tutoriel une fois après la mise en ligne.
    const os = require('node:os');
    const path = require('node:path');
    const fs = require('node:fs');
    const { openDb } = require('../src/db');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spl-tuto-'));
    const file = path.join(dir, 'speleologie.sqlite');
    const db = openDb(file);
    db.prepare("INSERT INTO users (username, username_key, password_hash, recovery_hash, created_at) VALUES ('ancien', 'ancien', 'x', 'y', 1)").run();
    db.exec('ALTER TABLE users DROP COLUMN tutorial_seen');
    db.close();
    const reopened = openDb(file);
    assert.equal(reopened.prepare("SELECT tutorial_seen FROM users WHERE username = 'ancien'").get().tutorial_seen, 0);
    reopened.prepare("INSERT INTO users (username, username_key, password_hash, recovery_hash, created_at) VALUES ('nouveau', 'nouveau', 'x', 'y', 2)").run();
    assert.equal(reopened.prepare("SELECT tutorial_seen FROM users WHERE username = 'nouveau'").get().tutorial_seen, 0);
    reopened.close();
    fs.rmSync(dir, { recursive: true, force: true });
  } finally {
    await app.close();
  }
});
