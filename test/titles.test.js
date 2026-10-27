'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Titles = require('../src/titles');
const Avatar = require('../src/avatar');
const Badges = require('../src/badges');
const { startServer, client, playDaily } = require('./helpers');

const badgeIds = () => new Set((Badges.CATALOG.keys ? [...Badges.CATALOG.keys()] : [...Badges.CATALOG].map((d) => d.id)));

test('titres : chaque titre de badge et chaque verrou de cosmétique renvoie à un badge existant', () => {
  const ids = badgeIds();
  for (const t of Titles.TITLES) for (const b of t.badges || []) assert.ok(ids.has(b), `titre ${t.id} : badge ${b} inconnu`);
  const labels = Titles.TITLES.map((t) => t.label);
  assert.equal(new Set(labels).size, labels.length, 'libellés uniques');
  const locks = Object.entries(Avatar.LOCKS);
  assert.ok(locks.length > 20);
  for (const [key, need] of locks) {
    const [slot, id] = key.split(':');
    assert.ok(Avatar.OPTIONS[slot] && Avatar.OPTIONS[slot].some((o) => o[0] === id), `verrou ${key} : option inconnue`);
    for (const b of need) assert.ok(ids.has(b), `verrou ${key} : badge ${b} inconnu`);
  }
});

test('titres : rang selon les jours forés, badges selon le compteur', () => {
  const cat = Titles.catalog([{ id: 'pepites-1', name: 'Chercheur d’or', count: 1 }, { id: 'attaquant-5', name: 'Attaquant', count: 0 }], 5);
  const get = (id) => cat.find((t) => t.id === id);
  assert.equal(get('apprenti-foreur').unlocked, true);
  assert.equal(get('mineur-confirme').unlocked, true);
  assert.equal(get('mineur-de-fond').unlocked, false);
  assert.equal(get('chercheur-d-or').unlocked, true);
  assert.equal(get('mineur-de-fond').hint, 'Forer 10 jours');
  assert.equal(Titles.labelOf('inconnu'), null);
});

test('foreuses de duel : épées, blindage et catapulte se gagnent par badges de duel', () => {
  const unlock = (id) => (Badges.CATALOG.get ? Badges.CATALOG.get(id) : [...Badges.CATALOG].find((d) => d.id === id)).unlock;
  assert.deepEqual(unlock('attaquant-5'), { type: 'bit', id: 'epee' });
  assert.deepEqual(unlock('duel-parfait'), { type: 'bit', id: 'excalibur' });
  assert.deepEqual(unlock('invaincu'), { type: 'body', id: 'blinde-arme' });
  assert.deepEqual(unlock('sentinelle-6'), { type: 'body', id: 'drakkar' });
  for (const [kind, list] of [['body', Badges.BODIES], ['bit', Badges.BITS]]) {
    const ids = list.map((x) => x[0]);
    assert.equal(new Set(ids).size, ids.length);
    const defs = Badges.CATALOG.values ? [...Badges.CATALOG.values()] : [...Badges.CATALOG];
    for (const d of defs) if (d.unlock && d.unlock.type === kind) assert.ok(ids.includes(d.unlock.id), `${d.id} → ${d.unlock.id}`);
  }
});

test('avatar : nouveaux traits, tenues et accessoires sont valides mais verrouillés', () => {
  const base = Avatar.defaultAvatar(1);
  assert.equal(base.trait, 'aucun');
  assert.equal(Avatar.normalize({ ...base, trait: 'cicatrice' }, 1).trait, 'cicatrice');
  assert.equal(Avatar.normalize({ ...base, trait: 'nimporte' }, 1).trait, 'aucun');
  const cat = Avatar.catalog([], true);
  assert.ok(cat.trait, 'nouveau groupe « trait »');
  assert.equal(cat.tenue.options.find((o) => o.id === 'armure').unlocked, false);
  assert.equal(cat.trait.options.find((o) => o.id === 'aucun').unlocked, true);
});

test('titre affiché : choix, refus des titres verrouillés, visible dans le classement', async () => {
  const app = await startServer();
  try {
    const ada = client(app.base);
    await ada('/api/signup', { username: 'ada', password: 'secret123' });
    assert.equal((await ada('/api/profile/title', { title: 'apprenti-foreur' })).status, 403, 'pas encore débloqué');
    assert.equal((await ada('/api/profile/title', { title: 12 })).status, 400);
    await playDaily(app, ada);
    let profile = (await ada('/api/profile')).data;
    assert.equal(profile.title, null);
    assert.equal(profile.titles.find((t) => t.id === 'apprenti-foreur').unlocked, true);
    assert.equal((await ada('/api/profile/title', { title: 'mineur-de-fond' })).status, 403);
    assert.equal((await ada('/api/profile/title', { title: 'inconnu' })).status, 403);
    assert.equal((await ada('/api/profile/title', { title: 'apprenti-foreur' })).status, 200);
    profile = (await ada('/api/profile')).data;
    assert.equal(profile.title, 'apprenti-foreur');
    const board = (await ada('/api/leaderboard?period=day')).data;
    assert.equal(board.entries.find((e) => e.username === 'ada').title, 'Apprenti foreur');
    assert.equal((await ada('/api/profile/title', { title: null })).status, 200);
    assert.equal((await ada('/api/profile')).data.title, null);
  } finally {
    await app.close();
  }
});

test('titres et nouveaux cosmétiques : ouverts à tous les joueurs', async () => {
  const app = await startServer();
  try {
    const boss = client(app.base);
    await boss('/api/signup', { username: 'boss', password: 'secret123' });
    const joueur = client(app.base);
    await joueur('/api/signup', { username: 'joueur', password: 'secret123' });
    await playDaily(app, joueur);

    const mine = (await joueur('/api/profile')).data;
    assert.ok(mine.titles.length > 40);
    assert.ok(mine.bodies.some((b) => b.id === 'blinde-arme'));
    assert.ok(mine.bits.some((b) => b.id === 'epee'));
    assert.ok(mine.avatarCatalog.trait.options.length > 1);
    assert.equal((await joueur('/api/profile/title', { title: 'apprenti-foreur' })).status, 200);
    // Un élément verrouillé reste refusé.
    assert.equal((await joueur('/api/profile/avatar', { avatar: { ...mine.avatar, trait: 'guerre' } })).status, 403);
    // Un avatar sans le champ « trait » (ancienne page restée ouverte) reste accepté.
    const { trait, ...old } = mine.avatar;
    assert.equal((await joueur('/api/profile/avatar', { avatar: old })).status, 200);
    // La vie de la mine est ouverte à tous.
    assert.equal((await joueur('/api/mine-today')).status, 200);
  } finally {
    await app.close();
  }
});
