'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, playDaily } = require('./helpers');

const DAY = 24 * 3600 * 1000;

test('statistiques du mode illimité et succès de thèmes rencontrés', async () => {
  const app = await startServer();
  try {
    const eve = client(app.base);
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    await playDaily(app, eve, 1, 'training');
    await playDaily(app, eve, 5, 'training'); // efface la partie précédente, les statistiques restent
    let profile = (await eve('/api/profile')).data;
    assert.equal(profile.playerStats.training.games, 2);
    assert.equal(profile.playerStats.training.themes, 14);
    assert.equal(profile.playerStats.training.answers, 14);
    assert.ok(profile.playerStats.training.best.points >= 40);
    assert.equal(profile.playerStats.daily.themes, 0);
    assert.equal(profile.playerStats.themesSeen, 14);
    assert.equal(profile.badges.find((b) => b.id === 'themes-25').count, 0);

    await playDaily(app, eve);
    await playDaily(app, eve, 1, 'training');
    await playDaily(app, eve, 1, 'training');
    profile = (await eve('/api/profile')).data;
    assert.equal(profile.playerStats.themesSeen, 35);
    assert.equal(profile.playerStats.daily.themes, 7);
    assert.equal(profile.badges.find((b) => b.id === 'themes-25').count, 1);
    assert.equal(profile.badges.find((b) => b.id === 'themes-100').count, 0);
  } finally {
    await app.close();
  }
});

test('comparaison des réponses : réservée à ceux qui ont fini ou aux jours passés', async () => {
  const app = await startServer();
  try {
    const eve = client(app.base);
    const bob = client(app.base);
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    await bob('/api/signup', { username: 'bob', password: 'secret123' });
    await playDaily(app, eve);
    const day = (await eve('/api/me')).data.today.day;

    assert.equal((await bob(`/api/compare?date=${day}`)).status, 403);
    assert.equal((await bob('/api/compare?date=nimporte')).status, 400);
    await playDaily(app, bob, 5);
    const { status, data } = await bob(`/api/compare?date=${day}`);
    assert.equal(status, 200);
    assert.equal(data.themes.length, 7);
    assert.deepEqual(data.players.map((p) => p.username).sort(), ['bob', 'eve']);
    assert.equal(data.players.find((p) => p.me).username, 'bob');
    assert.equal(data.players[0].rounds.length, 7);

    app.clock.now += DAY;
    const eve2 = await eve(`/api/compare?date=${day}`);
    assert.equal(eve2.status, 200);
    assert.equal(eve2.data.players.length, 2);
  } finally {
    await app.close();
  }
});

test('mode illimité : les réponses sont comptées sans historique ; accueil : série et badge le plus proche', async () => {
  const app = await startServer();
  try {
    const eve = client(app.base);
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    let me = (await eve('/api/me')).data;
    assert.equal(me.streak.current, 0);
    assert.equal(me.streak.playedToday, false);

    await playDaily(app, eve, 1, 'training');
    const total = () => app.db.prepare('SELECT COALESCE(SUM(n), 0) AS n FROM training_answer_counts').get().n;
    assert.equal(total(), 7);
    await playDaily(app, eve, 1, 'training');
    assert.equal(total(), 14, 'cumulé même quand la partie précédente est effacée');
    assert.equal(app.db.prepare('SELECT COALESCE(SUM(n), 0) AS n FROM answer_counts').get().n, 0, 'le modèle de rareté du jour reste intact');

    await playDaily(app, eve);
    me = (await eve('/api/me')).data;
    assert.equal(me.streak.current, 1);
    assert.equal(me.streak.playedToday, true);
    assert.ok(me.streak.next, 'un badge proche est proposé');
    assert.ok(me.streak.next.remaining > 0);
    assert.ok(me.streak.nexts.length >= 1 && me.streak.nexts.length <= 3, 'jusqu\'à trois prochains badges');
    assert.equal(me.streak.nexts[0].id, me.streak.next.id);
    app.clock.now += 24 * 3600 * 1000;
    me = (await eve('/api/me')).data;
    assert.equal(me.streak.current, 1, 'la série reste à sauver aujourd\'hui');
    assert.equal(me.streak.playedToday, false);
  } finally {
    await app.close();
  }
});

test('liste des réponses : le compteur du mode illimité est fourni', async () => {
  const app = await startServer();
  try {
    const eve = client(app.base);
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    const state = await playDaily(app, eve);
    const themeId = app.db.prepare('SELECT theme_id FROM rounds WHERE game_id = ? AND slot = 0').get(state.id).theme_id;
    const key = app.db.prepare('SELECT answer_key FROM rounds WHERE game_id = ? AND slot = 0').get(state.id).answer_key;
    app.db.prepare('INSERT INTO training_answer_counts (theme_id, answer_key, n) VALUES (?, ?, 5)').run(themeId, key);
    const { data } = await eve(`/api/game/${state.id}/answers?slot=0`);
    const mine = data.answers.find((a) => a.mine);
    assert.equal(mine.trainingCount, 5);
    assert.ok(data.answers.every((a) => Number.isInteger(a.trainingCount)));
  } finally {
    await app.close();
  }
});

test('graphiques, bilan du mois, défi de la semaine et tableau de bord du responsable', async () => {
  const app = await startServer();
  try {
    const chef = client(app.base);
    const eve = client(app.base);
    await chef('/api/signup', { username: 'chef', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    for (let i = 0; i < 3; i++) {
      await playDaily(app, eve, [1, 5, 3][i]);
      app.clock.now += DAY;
    }
    app.clock.now -= DAY; // retour au 16 octobre pour rester dans le même mois
    const { charts } = (await eve('/api/profile')).data.playerStats;
    assert.equal(charts.calendar.length, 84);
    assert.equal(charts.recent.length, 3);
    assert.equal(charts.calendar.filter((d) => d.score != null).length, 3);
    assert.equal(Object.values(charts.tiers).reduce((a, b) => a + b, 0), 21);

    const month = (await eve('/api/month')).data;
    assert.equal(month.month, '2026-10');
    assert.equal(month.days, 3);
    assert.ok(month.bestGame.score > 0);
    assert.equal((await eve('/api/month?month=2026-09')).data.days, 0);

    const challenge = (await eve('/api/me')).data.streak.challenge;
    assert.ok(challenge.text && challenge.goal > 0 && challenge.progress >= 0);

    assert.equal((await eve('/api/admin/dashboard')).status, 403);
    const dash = (await chef('/api/admin/dashboard')).data;
    assert.equal(dash.totalPlayers, 2);
    assert.ok(Array.isArray(dash.perDay));
  } finally {
    await app.close();
  }
});
