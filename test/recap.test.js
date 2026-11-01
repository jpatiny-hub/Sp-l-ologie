'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, playDaily } = require('./helpers');

test('récap du lundi : proposé une seule fois, avec le podium de la semaine écoulée', async () => {
  const app = await startServer();
  try {
    // Semaine du lundi 19 octobre 2026 : trois joueurs.
    app.clock.now = Date.UTC(2026, 9, 20, 10, 0);
    const adam = client(app.base);
    const eve = client(app.base);
    const jose = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    await jose('/api/signup', { username: 'jose', password: 'secret123' });
    await playDaily(app, adam, 3);
    await playDaily(app, eve, 1);
    assert.equal((await adam('/api/me')).data.recap, null, 'rien tant que la semaine n\'est pas terminée');

    app.clock.now = Date.UTC(2026, 9, 26, 10, 0); // lundi 26
    const me = (await adam('/api/me')).data;
    assert.equal(me.recap, '2026-10-19');
    const recap = (await adam('/api/recap?week=2026-10-19')).data;
    assert.equal(recap.players, 2);
    assert.equal(recap.entries.length, 2);
    assert.equal(recap.champion.rank, 1);
    assert.equal(recap.champion.drill, 'chantier/aucun/spirale', 'sans choix dans l\'Atelier, la fête prend la foreuse 16-bit de base');
    assert.equal(recap.games, 2);
    assert.equal(recap.me.rank, recap.entries.find((e) => e.me).rank);
    assert.ok(recap.best && recap.best.score > 0);
    assert.ok(recap.rarest && recap.rarest.answer);
    assert.equal((await adam('/api/recap?week=2026-10-26')).status, 400, 'la semaine en cours n\'a pas de récap');

    // Jose, inscrit avant la fin de la semaine mais sans forage, le voit aussi ; une fois vu, il ne revient plus.
    assert.equal((await jose('/api/me')).data.recap, '2026-10-19');
    await jose('/api/recap/seen', { week: '2026-10-19' });
    assert.equal((await jose('/api/me')).data.recap, null);
    assert.equal((await adam('/api/me')).data.recap, '2026-10-19', 'chacun son tour');

    // Un joueur inscrit pendant la semaine en cours n'a rien à voir.
    const late = client(app.base);
    await late('/api/signup', { username: 'late', password: 'secret123' });
    assert.equal((await late('/api/me')).data.recap, null);
  } finally {
    await app.close();
  }
});

test('podiums du jour, de la semaine et du mois : dans l\'ordre, une seule fois', async () => {
  const app = await startServer();
  try {
    app.clock.now = Date.UTC(2026, 9, 29, 10, 0); // jeudi 29 octobre
    const adam = client(app.base);
    const eve = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    await playDaily(app, adam, 3);
    await playDaily(app, eve, 1);
    assert.deepEqual((await adam('/api/me')).data.celebrations, [], 'la journée n\'est pas terminée');

    app.clock.now = Date.UTC(2026, 9, 30, 10, 0); // vendredi : podium de la veille
    assert.deepEqual((await adam('/api/me')).data.celebrations, [{ kind: 'day', start: '2026-10-29' }]);
    const day = (await adam('/api/celebration?kind=day&start=2026-10-29')).data;
    assert.equal(day.kind, 'day');
    assert.equal(day.entries.length, 2);
    assert.equal(day.entries[0].username, 'adam');
    assert.ok(day.me.bestAnswer && day.me.bestAnswer.answer);
    assert.equal((await adam('/api/celebration?kind=day&start=2026-10-30')).status, 400, 'jour en cours');
    assert.equal((await adam('/api/celebration?kind=year')).status, 400);
    await adam('/api/celebration/seen', { kind: 'day', start: '2026-10-29' });
    assert.deepEqual((await adam('/api/me')).data.celebrations, []);
    assert.equal((await eve('/api/me')).data.celebrations.length, 1, 'chacun son tour');

    // Dimanche 1er novembre → lundi 2 : jour, puis semaine ; le mois n'arrive qu'à partir du 1er du mois suivant.
    app.clock.now = Date.UTC(2026, 10, 2, 10, 0);
    assert.deepEqual((await adam('/api/me')).data.celebrations.map((c) => c.kind), ['week']);
    app.clock.now = Date.UTC(2026, 10, 30, 10, 0); // lundi 30 novembre : semaine du 23 et rien d'autre
    await adam('/api/celebration/seen', { kind: 'week', start: '2026-10-26' });
    // 1er décembre : le mois de novembre n'a pas de forage, donc pas de podium.
    app.clock.now = Date.UTC(2026, 11, 1, 10, 0);
    assert.deepEqual((await adam('/api/me')).data.celebrations, []);
  } finally {
    await app.close();
  }
});

test('podium du mois : le mois écoulé arrive après la semaine', async () => {
  const app = await startServer();
  try {
    app.clock.now = Date.UTC(2026, 10, 30, 10, 0); // lundi 30 novembre
    const adam = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await playDaily(app, adam, 3);
    app.clock.now = Date.UTC(2026, 11, 1, 10, 0); // mardi 1er décembre
    const kinds = (await adam('/api/me')).data.celebrations.map((c) => c.kind);
    assert.deepEqual(kinds, ['day', 'month']);
    const month = (await adam('/api/celebration?kind=month&start=2026-11-01')).data;
    assert.equal(month.start, '2026-11-01');
    assert.equal(month.end, '2026-11-30');
    assert.equal(month.daysInPeriod, 30);
    assert.equal(month.me.days, 1);
  } finally {
    await app.close();
  }
});
