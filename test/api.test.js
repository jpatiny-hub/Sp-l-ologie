'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { createApp } = require('../server');
const { openDb } = require('../src/db');
const { loadThemes } = require('../src/themes');

const THEMES = loadThemes(path.join(__dirname, '..', 'data', 'themes'));

/** Démarre l'application sur un port libre, avec une horloge contrôlable. */
async function startServer() {
  const clock = { now: Date.UTC(2026, 9, 14, 10, 0) }; // mercredi 14 octobre 2026
  const db = openDb(':memory:');
  const server = http.createServer(createApp({ db, themes: THEMES, now: () => clock.now }));
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { clock, db, base, close: () => new Promise((r) => server.close(r)) };
}

function client(base) {
  let cookie = '';
  return async function call(pathname, body) {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    const opts = { headers };
    if (body !== undefined) {
      opts.method = 'POST';
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(base + pathname, opts);
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  };
}

/** Trouve une réponse valide (du niveau demandé) pour le thème actuellement révélé. */
function answerFor(db, gameId, level) {
  const round = db.prepare('SELECT theme_id FROM rounds WHERE game_id = ? AND answered_at IS NULL ORDER BY slot').get(gameId);
  const answers = THEMES.get(round.theme_id).answers;
  // Certains thèmes n'ont pas de niveau 5 : on prend alors le plus rare disponible.
  const available = Math.min(level, Math.max(...answers.map((a) => a.level)));
  return answers.find((a) => a.level === available).label;
}

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

    // Bob ne peut pas voir la partie d'Alice.
    assert.equal((await bob(`/api/game/${game.id}`)).status, 404);

    // Podium de la semaine.
    const board = (await bob('/api/leaderboard')).data;
    assert.equal(board.weekStart, '2026-10-12');
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
    assert.equal(nextWeek.weekStart, '2026-10-19');
    assert.equal(nextWeek.entries.length, 0);
    const lastWeek = (await alice('/api/leaderboard?week=2026-10-12')).data;
    assert.equal(lastWeek.entries[0].score, firstPoints + 40);
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
