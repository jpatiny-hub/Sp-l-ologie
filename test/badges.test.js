'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { easter, calendarKinds } = require('../src/badges');
const { startServer, client, playDaily, answerFor } = require('./helpers');

const DAY = 24 * 3600 * 1000;

test('calendrier : Pâques, jours fixes et vendredi 13', () => {
  assert.equal(easter(2026), '2026-04-05');
  assert.equal(easter(2027), '2027-03-28');
  assert.deepEqual(calendarKinds('2026-10-31'), ['halloween']);
  assert.deepEqual(calendarKinds('2026-05-17'), ['fierte']);
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
    assert.equal(badge(profile, 'sans-eboulement').count, 1, 'un badge ne se gagne qu’une fois');
    assert.equal((await eve('/api/me')).data.unseenBadges, 7, 'dont Éclair (horloge figée) et un premier défi');

    // Acier débloqué par la série de 3 jours : le choix est gardé sur le compte.
    assert.equal(profile.bodies.find((b) => b.id === 'acier').unlocked, true);
    assert.equal((await eve('/api/profile/skin', { body: 'acier', bit: 'standard' })).status, 200);
    assert.deepEqual((await eve('/api/me')).data.skin, { body: 'acier', bit: 'standard', timer: 'batterie' });
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

test('7 réponses communes ou évidentes dans un forage : Sentier battu et Autoroute', async () => {
  const app = await startServer();
  try {
    const kim = client(app.base);
    await kim('/api/signup', { username: 'kim', password: 'secret123' });
    await playDaily(app, kim, 1);
    let profile = (await kim('/api/profile')).data;
    assert.equal(badge(profile, 'sentier-battu').count, 1);
    assert.equal(badge(profile, 'autoroute').count, 1);

    const lou = client(app.base);
    await lou('/api/signup', { username: 'lou', password: 'secret123' });
    app.clock.now += DAY;
    await playDaily(app, lou, 4);
    profile = (await lou('/api/profile')).data;
    assert.equal(badge(profile, 'sentier-battu').count, 0);
    assert.equal(badge(profile, 'autoroute').count, 0);
  } finally {
    await app.close();
  }
});

test('semaine entière : premier chaque jour, ou dernier chaque jour', async () => {
  const app = await startServer();
  try {
    let d = new Date(app.clock.now);
    while (d.getUTCDay() !== 1) d = new Date(d.getTime() + DAY);
    app.clock.now = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 10, 0);
    const names = ['max', 'nora', 'otto'];
    const players = names.map(() => client(app.base));
    for (const [i, call] of players.entries()) await call('/api/signup', { username: names[i], password: 'secret123' });
    for (let day = 0; day < 7; day++) {
      await playDaily(app, players[0], 4);
      await playDaily(app, players[1], 2);
      await playDaily(app, players[2], 1);
      app.clock.now += DAY;
    }
    const [max, nora, otto] = await Promise.all(players.map(async (p) => (await p('/api/profile')).data));
    assert.equal(badge(max, 'semaine-en-tete').count, 1);
    assert.equal(badge(max, 'lanterne-rouge').count, 0);
    assert.equal(badge(otto, 'lanterne-rouge').count, 1);
    assert.equal(badge(otto, 'semaine-en-tete').count, 0);
    assert.equal(badge(nora, 'semaine-en-tete').count + badge(nora, 'lanterne-rouge').count, 0);
  } finally {
    await app.close();
  }
});

test('lanterne rallumée, éclair, in extremis et filon', async () => {
  const { BadgeService } = require('../src/badges');
  assert.deepEqual(BadgeService.runs(['2026-10-01', '2026-10-02', '2026-10-05']).map((r) => r.length), [2, 1]);

  const app = await startServer();
  try {
    const eve = client(app.base);
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    // Sept jours d'affilée, puis trois jours sans jouer, puis un nouveau forage.
    for (let i = 0; i < 7; i++) {
      await playDaily(app, eve);
      app.clock.now += DAY;
    }
    let profile = (await eve('/api/profile')).data;
    assert.equal(badge(profile, 'lanterne-rallumee').count, 0);
    assert.equal(badge(profile, 'eclair').count, 1, 'réponses instantanées avec l\'horloge figée');
    assert.equal(badge(profile, 'in-extremis').count, 0);
    app.clock.now += 3 * DAY;
    // Forage où une réponse arrive dans la dernière seconde du chrono.
    const { data: game } = await eve('/api/game/start', { mode: 'daily' });
    for (let i = 0; i < 7; i++) {
      await eve(`/api/game/${game.id}/reveal`, {});
      if (i === 0) app.clock.now += 29.4 * 1000;
      await eve(`/api/game/${game.id}/answer`, { text: answerFor(app.db, game.id, 1) });
    }
    profile = (await eve('/api/profile')).data;
    assert.equal(badge(profile, 'lanterne-rallumee').count, 1);
    assert.equal(badge(profile, 'in-extremis').count, 1);
  } finally {
    await app.close();
  }
});

test('étais de galerie : un étai tous les 7 jours d\'affilée, il pardonne un jour manqué (à partir du 21 octobre)', async () => {
  const { BadgeService } = require('../src/badges');
  // Calcul pur : 7 jours d'affilée → 1 étai ; un jour manqué est pardonné, puis deux jours manqués sans étai cassent la série.
  const week = ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'];
  let info = BadgeService.streakInfo(week, '2026-10-31', '2026-10-21');
  assert.deepEqual([info.current, info.freezes], [7, 1]);
  info = BadgeService.streakInfo([...week, '2026-11-02'], '2026-11-02', '2026-10-21');
  assert.deepEqual([info.current, info.freezes, info.frozen], [8, 0, ['2026-11-01']]);
  info = BadgeService.streakInfo([...week, '2026-11-04'], '2026-11-04', '2026-10-21');
  assert.equal(info.current, 1, 'deux jours manqués, un seul étai : série perdue');
  // Jour non joué aujourd'hui : l'étai est annoncé comme « en attente » mais pas encore consommé.
  info = BadgeService.streakInfo(week, '2026-11-02', '2026-10-21');
  assert.deepEqual([info.current, info.freezes, info.pending], [7, 0, 1]);
  // Avant la date de départ, rien n'est pardonné.
  info = BadgeService.streakInfo(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-09'], '2026-10-09', '2026-10-21');
  assert.equal(info.current, 1);
  // Plafond de 3 étais.
  const long = [];
  for (let i = 0; i < 40; i++) long.push(new Date(Date.UTC(2026, 9, 21 + i, 12)).toISOString().slice(0, 10));
  assert.equal(BadgeService.streakInfo(long, long[39], '2026-10-21').freezes, 3);

  // Bout en bout : accueil et carnet.
  const app = await startServer();
  try {
    app.clock.now = Date.UTC(2026, 9, 25, 10, 0);
    const eve = client(app.base);
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    for (let i = 0; i < 7; i++) {
      await playDaily(app, eve);
      app.clock.now += DAY;
    }
    let me = (await eve('/api/me')).data;
    assert.equal(me.streak.freezes, 1);
    app.clock.now += DAY; // un jour manqué (1er novembre)
    me = (await eve('/api/me')).data;
    assert.equal(me.streak.current, 7, 'la série tient grâce à l\'étai');
    assert.equal(me.streak.pendingFreezes, 1);
    await playDaily(app, eve);
    me = (await eve('/api/me')).data;
    assert.equal(me.streak.current, 8);
    assert.equal(me.streak.freezes, 0);
    assert.equal(badge((await eve('/api/profile')).data, 'serie-7').count, 1);
  } finally {
    await app.close();
  }
});

test('apparences du chrono : la batterie est offerte, les autres se débloquent avec des badges', async () => {
  const app = await startServer();
  try {
    const eve = client(app.base);
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    const profile = (await eve('/api/profile')).data;
    const timers = Object.fromEntries(profile.timers.map((t) => [t.id, t]));
    assert.equal(timers.batterie.unlocked, true);
    for (const id of ['meche', 'wagonnet', 'lanterne']) assert.equal(timers[id].unlocked, false, id);
    assert.match(timers.meche.hint, /In extremis/);
    assert.match(timers.meche.hint, /Filon/);
    assert.equal((await eve('/api/profile/skin', { body: 'classique', bit: 'standard', timer: 'meche' })).status, 403);
    // Une réponse dans la dernière seconde débloque la mèche (via « In extremis »).
    const { data: game } = await eve('/api/game/start', { mode: 'daily' });
    await eve(`/api/game/${game.id}/reveal`, {});
    app.clock.now += 29.4 * 1000;
    await eve(`/api/game/${game.id}/answer`, { text: answerFor(app.db, game.id, 1) });
    for (let i = 1; i < 7; i++) {
      await eve(`/api/game/${game.id}/reveal`, {});
      await eve(`/api/game/${game.id}/answer`, { text: answerFor(app.db, game.id, 1) });
    }
    const res = await eve('/api/profile/skin', { body: 'classique', bit: 'standard', timer: 'meche' });
    assert.equal(res.status, 200);
    assert.equal(res.data.skin.timer, 'meche');
    assert.equal((await eve('/api/me')).data.skin.timer, 'meche');
    // Sans préciser le chrono, on garde le choix actuel.
    assert.equal((await eve('/api/profile/skin', { body: 'classique', bit: 'standard' })).data.skin.timer, 'meche');
  } finally {
    await app.close();
  }
});
