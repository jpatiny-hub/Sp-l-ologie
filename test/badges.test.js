'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { easter, calendarKinds } = require('../src/badges');
const { startServer, client, playDaily } = require('./helpers');

const DAY = 24 * 3600 * 1000;

test('calendrier : Pâques, jours fixes et vendredi 13', () => {
  assert.equal(easter(2026), '2026-04-05');
  assert.equal(easter(2027), '2027-03-28');
  assert.deepEqual(calendarKinds('2026-10-31'), ['halloween']);
  assert.deepEqual(calendarKinds('2027-01-01'), ['nouvel-an']);
  assert.deepEqual(calendarKinds('2026-11-13'), ['vendredi-13']);
  assert.deepEqual(calendarKinds('2027-03-28'), ['paques']);
  assert.deepEqual(calendarKinds('2026-10-14'), []);
});

const badge = (profile, id) => profile.badges.find((b) => b.id === id);

test('série de jours, apparences débloquées et choix de la foreuse', async () => {
  const app = await startServer();
  try {
    const eve = client(app.base);
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    let profile = (await eve('/api/profile')).data;
    assert.equal(badge(profile, 'premier-forage').count, 0);
    assert.equal(profile.bodies.find((b) => b.id === 'acier').unlocked, false);
    assert.equal((await eve('/api/profile/skin', { body: 'acier', bit: 'standard' })).status, 403);

    for (let i = 0; i < 3; i++) {
      await playDaily(app, eve);
      app.clock.now += DAY;
    }
    profile = (await eve('/api/profile')).data;
    assert.equal(profile.stats.currentStreak, 3);
    assert.equal(profile.stats.bestStreak, 3);
    assert.equal(badge(profile, 'premier-forage').count, 1);
    assert.equal(badge(profile, 'serie-3').count, 1);
    assert.equal(badge(profile, 'serie-3').isNew, true);
    assert.equal(badge(profile, 'serie-7').count, 0);
    assert.equal(badge(profile, 'sans-eboulement').count, 3, 'répétable : une fois par jour');
    assert.equal((await eve('/api/me')).data.unseenBadges, 5);

    // Acier débloqué par la série de 3 jours : le choix est gardé sur le compte.
    assert.equal(profile.bodies.find((b) => b.id === 'acier').unlocked, true);
    assert.equal((await eve('/api/profile/skin', { body: 'acier', bit: 'standard' })).status, 200);
    assert.deepEqual((await eve('/api/me')).data.skin, { body: 'acier', bit: 'standard' });
    assert.equal((await eve('/api/profile/skin', { body: 'acier', bit: 'carotteuse' })).status, 403);

    await eve('/api/profile/seen', {});
    assert.equal((await eve('/api/me')).data.unseenBadges, 0);

    // Un jour sans forage casse la série.
    app.clock.now += DAY;
    await playDaily(app, eve);
    profile = (await eve('/api/profile')).data;
    assert.equal(profile.stats.currentStreak, 1);
    assert.equal(profile.stats.bestStreak, 3);
  } finally {
    await app.close();
  }
});

test("forage d'Halloween : badge de l'année et citrouille diabolique", async () => {
  const app = await startServer();
  app.clock.now = Date.UTC(2026, 9, 31, 10, 0);
  try {
    const finn = client(app.base);
    await finn('/api/signup', { username: 'finn', password: 'secret123' });
    let profile = (await finn('/api/profile')).data;
    assert.equal(badge(profile, 'nouvel-an').name, 'Passage à 2027', 'badge à venir : prochaine occurrence');
    await playDaily(app, finn);
    profile = (await finn('/api/profile')).data;
    assert.deepEqual(badge(profile, 'halloween').years, ['2026']);
    assert.equal(profile.bodies.find((b) => b.id === 'citrouille').unlocked, true);
    assert.equal((await finn('/api/profile/skin', { body: 'citrouille', bit: 'standard' })).status, 200);
  } finally {
    await app.close();
  }
});

test('podium : le premier du jour reçoit son badge une fois la journée terminée, à partir de 3 joueurs', async () => {
  const app = await startServer();
  try {
    const players = ['gus', 'hana', 'ines'].map(() => client(app.base));
    for (const [i, call] of players.entries()) {
      await call('/api/signup', { username: ['gus', 'hana', 'ines'][i], password: 'secret123' });
      await playDaily(app, call, i === 0 ? 4 : 1);
    }
    // Journée pas encore terminée : pas de badge.
    assert.equal(badge((await players[0]('/api/profile')).data, 'podium-jour').count, 0);
    app.clock.now += DAY;
    assert.equal(badge((await players[0]('/api/profile')).data, 'podium-jour').count, 1);
    assert.equal(badge((await players[1]('/api/profile')).data, 'podium-jour').count, 0);

    // Le lendemain, seulement 2 joueurs : pas de badge pour ce jour-là.
    await playDaily(app, players[1], 4);
    await playDaily(app, players[2], 1);
    app.clock.now += DAY;
    assert.equal(badge((await players[1]('/api/profile')).data, 'podium-jour').count, 0);
  } finally {
    await app.close();
  }
});
