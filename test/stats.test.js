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
