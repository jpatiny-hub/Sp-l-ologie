'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client } = require('./helpers');
const Gems = require('../src/gems');
const { categoryOf } = require('../src/categories');
const { collectiveStatus, showcase } = require('../src/collective');

const badge = (profile, id) => profile.badges.find((b) => b.id === id);

test('galeries : douze pierres, une par mois, avec un défi et des couleurs complètes', () => {
  assert.equal(Object.keys(Gems.GEMS).length, 12);
  const ids = new Set();
  for (let m = 1; m <= 12; m++) {
    const g = Gems.GEMS[m];
    assert.ok(g, `mois ${m}`);
    ids.add(g.id);
    assert.equal(g.gem.length, 4);
    assert.equal(g.deco.length, 4);
    assert.equal(g.water.length, 4);
    assert.equal(g.wall.length, 4);
    assert.equal(g.rock.length, 5);
    assert.ok(Gems.KINDS[Gems.CYCLE[m]], `défi du mois ${m}`);
  }
  assert.equal(ids.size, 12, 'pierres toutes différentes');
  assert.equal(Gems.niceGoal(4500 * 12), 54000);
  assert.equal(Gems.niceGoal(2.2 * 3), 7);
});

test('défi du mois : l\'objectif suit le nombre de joueurs actifs du mois précédent', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    const adamId = app.db.prepare('SELECT id FROM users').get().id;
    // Octobre : six joueurs avec 4 jours de forage ou plus, un septième avec 3 jours seulement.
    const insertUser = app.db.prepare("INSERT INTO users (username, username_key, password_hash, recovery_hash, created_at) VALUES (?, ?, 'x', 'x', 0)");
    const insertGame = app.db.prepare("INSERT INTO games (user_id, mode, day, score, created_at, finished_at) VALUES (?, 'daily', ?, ?, 0, 1)");
    const ids = [adamId];
    for (let i = 1; i < 7; i++) ids.push(Number(insertUser.run(`j${i}`, `j${i}`).lastInsertRowid));
    ids.forEach((id, i) => { for (let d = 1; d <= (i === 6 ? 3 : 4); d++) insertGame.run(id, `2026-10-0${d}`, 100); });
    const nov = collectiveStatus(app.db, '2026-11-05', adamId);
    assert.equal(nov.gallery.kind, 'points');
    assert.equal(nov.gallery.active, 6);
    assert.equal(nov.goal, 27000);
    assert.equal(nov.gallery.gem, 'emeraude');
    assert.equal(nov.gallery.colors.gem.length, 4);
    assert.equal(nov.duel.goal, 24, '4 duels par joueur actif');
    // Décembre : les réponses valides remplacent les points, l'objectif est 90 par joueur actif (4 joueurs au moins).
    const dec = collectiveStatus(app.db, '2026-12-05', adamId);
    assert.equal(dec.gallery.kind, 'reponses');
    assert.equal(dec.gallery.gem, 'saphir');
    assert.equal(dec.gallery.active, 4, 'minimum de 4 joueurs');
    assert.equal(dec.goal, 360);
    // Avant novembre 2026 : l'ancien défi à 10 000 points, sans galerie.
    const oct = collectiveStatus(app.db, '2026-10-20', adamId);
    assert.equal(oct.goal, 10000);
    assert.equal(oct.gallery, undefined);
  } finally {
    await app.close();
  }
});

test('filon du mois : récompenses pour qui fore 10 jours quand le groupe atteint l\'objectif', async () => {
  const app = await startServer();
  try {
    app.clock.now = Date.UTC(2026, 10, 25, 10, 0); // 25 novembre 2026
    const names = ['adam', 'eve', 'ines', 'joel', 'louis'];
    const calls = {};
    for (const n of names) {
      calls[n] = client(app.base);
      assert.equal((await calls[n]('/api/signup', { username: n, password: 'secret123' })).status, 201);
    }
    const idOf = (n) => app.db.prepare('SELECT id FROM users WHERE username = ?').get(n).id;
    const insertGame = app.db.prepare("INSERT INTO games (user_id, mode, day, score, created_at, finished_at) VALUES (?, 'daily', ?, ?, 0, 1)");
    // Octobre : 5 joueurs actifs, donc un objectif de 22 500 points. Novembre : adam et eve 12 jours, louis 5 jours.
    for (const n of names) for (let d = 1; d <= 4; d++) insertGame.run(idOf(n), `2026-10-0${d}`, 100);
    const day = (d) => `2026-11-${String(d).padStart(2, '0')}`;
    for (let d = 1; d <= 12; d++) { insertGame.run(idOf('adam'), day(d), 1000); insertGame.run(idOf('eve'), day(d), 400); }
    for (let d = 1; d <= 5; d++) insertGame.run(idOf('louis'), day(d), 1000);
    let adam = (await calls.adam('/api/profile')).data;
    assert.equal(badge(adam, 'filon-emeraude').count, 0, 'total 21 800 : le filon n\'est pas atteint');
    assert.equal(adam.drillCatalog.styles.find((s) => s.id === 'gemme-emeraude').unlocked, false);
    insertGame.run(idOf('louis'), day(13), 1000); // 22 800 ≥ 22 500
    adam = (await calls.adam('/api/profile')).data;
    assert.equal(badge(adam, 'filon-emeraude').count, 1);
    assert.equal(adam.drillCatalog.styles.find((s) => s.id === 'gemme-emeraude').unlocked, true, 'carrosserie de la pierre du mois');
    assert.ok(adam.avatarCatalog.aura.options.find((o) => o.id === 'gem-emeraude').unlocked, 'aura de la pierre');
    assert.ok(adam.titles.find((t) => t.id === 'filon-emeraude').unlocked, 'titre de la pierre');
    const eve = (await calls.eve('/api/profile')).data;
    assert.equal(badge(eve, 'filon-emeraude').count, 1, 'eve a foré 12 jours');
    const louis = (await calls.louis('/api/profile')).data;
    assert.equal(badge(louis, 'filon-emeraude').count, 0, 'louis n\'a foré que 6 jours');
    assert.equal(louis.drillCatalog.styles.find((s) => s.id === 'gemme-emeraude').unlocked, false);
    // Vitrine : novembre trouvé, décembre en cours, les mois suivants à venir.
    const shelf = showcase(app.db, '2026-12-03', idOf('adam'));
    assert.equal(shelf.length, 12);
    assert.deepEqual(shelf.slice(0, 3).map((g) => g.state), ['found', 'current', 'future']);
    assert.equal(shelf[0].mine, true);
    assert.equal(shelf[2].name, null, 'les pierres à venir restent secrètes');
  } finally {
    await app.close();
  }
});

test('badges secrets : thématiques déduites des identifiants de thèmes', async () => {
  assert.equal(categoryOf('animaux-a-corne'), 'nature');
  assert.equal(categoryOf('albums-tintin'), 'cinema');
  assert.equal(categoryOf('capitales-europe'), 'geo');
  assert.equal(categoryOf('abonnements'), null);
  const app = await startServer();
  try {
    const adam = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    const id = app.db.prepare('SELECT id FROM users').get().id;
    const game = app.db.prepare("INSERT INTO games (user_id, mode, day, score, created_at, finished_at) VALUES (?, 'daily', ?, 10, 0, 1)");
    const round = app.db.prepare("INSERT INTO rounds (game_id, slot, theme_id, points, outcome) VALUES (?, ?, ?, 10, 'answer')");
    for (let g = 0; g < 3; g++) {
      const gid = Number(game.run(id, `2026-10-0${g + 1}`).lastInsertRowid);
      for (let slot = 0; slot < 7; slot++) round.run(gid, slot, 'animaux-a-corne');
    }
    let profile = (await adam('/api/profile')).data;
    assert.equal(badge(profile, 'cat-nature'), undefined, 'secret tant qu\'il n\'est pas obtenu');
    assert.equal(profile.badges.some((b) => b.id.startsWith('cat-')), false);
    // Le badge se débloque à la fin d'un forage : on rejoue une partie complète.
    const { playDaily } = require('./helpers');
    await playDaily(app, adam, 1);
    profile = (await adam('/api/profile')).data;
    assert.equal(badge(profile, 'cat-nature').count, 1, '21 réponses sur des thèmes de nature (15 demandées)');
    assert.ok(profile.avatarCatalog.accessoire.options.find((o) => o.id === 'pin-nature').unlocked);
    assert.equal(profile.badges.some((b) => b.id === 'cat-touche-a-tout'), false);
  } finally {
    await app.close();
  }
});
