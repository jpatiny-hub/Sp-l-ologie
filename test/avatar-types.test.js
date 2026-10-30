'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Avatar = require('../src/avatar');

test('avatar : types de personnage, valeurs par défaut et anciens enregistrements', () => {
  const base = Avatar.defaultAvatar(5);
  for (const slot of ['espece', 'piercing', 'tatouage', 'accessoire']) assert.ok(base[slot], slot);
  assert.equal(base.espece, 'humain');
  // Un avatar enregistré avant l'arrivée des types reste valide.
  const old = { ...base };
  delete old.espece;
  assert.equal(Avatar.normalize(old, 5).espece, 'humain');
  assert.equal(Avatar.normalize({ ...base, espece: 'dragon' }, 5).espece, 'humain');
  assert.equal(Avatar.normalize({ ...base, espece: 'robot', tatouage: 'ancre' }, 5).espece, 'robot');
});

test('avatar : « juste le poil » est réservé à la taupe', () => {
  const base = Avatar.defaultAvatar(5);
  assert.equal(Avatar.normalize({ ...base, tenue: 'poil' }, 5).tenue, base.tenue);
  assert.equal(Avatar.normalize({ ...base, espece: 'taupe', tenue: 'poil' }, 5).tenue, 'poil');
  assert.equal(Avatar.validate({ ...base, tenue: 'poil' }, 5, []), null);
  assert.ok(Avatar.validate({ ...base, espece: 'taupe', tenue: 'poil' }, 5, []));
});

test('avatar : nouveaux éléments libres acceptés, armes et armures de duel verrouillées', () => {
  const base = Avatar.defaultAvatar(5);
  const mine = { ...base, espece: 'nain', barbe: 'tressee', piercing: 'nez', tatouage: 'serpent', accessoire: 'noeud-papillon', chapeau: 'melon', tenue: 'mineur-nain', objet: 'chope' };
  assert.deepEqual(Avatar.validate(mine, 5, []), mine);
  assert.equal(Avatar.validate({ ...mine, objet: 'hache' }, 5, []), null);
  // Une vieille page qui n'envoie pas les champs récents reste acceptée.
  const { espece, piercing, tatouage, accessoire, ...old } = base;
  assert.equal(Avatar.validate(old, 5, []).espece, 'humain');
  // Chaque option du catalogue est dessinable : pas d'identifiant sans dessin côté navigateur.
  const draw = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'public', 'avatar.js'), 'utf8');
  for (const slot of ['espece', 'cheveux', 'yeux', 'aura', 'dos', 'bouche', 'compagnon', 'barbe', 'piercing', 'tatouage', 'accessoire', 'chapeau', 'tenue', 'objet']) {
    for (const [id] of Avatar.OPTIONS[slot]) {
      if (['aucun', 'aucune', 'points', 'court', 'humain', 'mineur', 'chauve', 'pull', 'poil', 'defaut', 'aucune', 'normal'].includes(id)) continue;
      assert.ok(draw.includes(`'${id}'`) || draw.includes(`${id}:`), `${slot}:${id} n'a pas de dessin`);
    }
  }
});

test('avatar : jack-o-lantern et autres éléments de jours spéciaux demandent le bon badge', () => {
  const base = Avatar.defaultAvatar(5);
  const pumpkin = { ...base, espece: 'citrouille' };
  const badge = (id, count) => ({ id, name: id, description: 'd', count });
  assert.equal(Avatar.validate(pumpkin, 5, [badge('halloween', 0)]), null);
  assert.ok(Avatar.validate(pumpkin, 5, [badge('halloween', 1)]));
  assert.equal(Avatar.validate({ ...base, espece: 'fantome' }, 5, [badge('halloween', 1)]), null, 'le fantôme vient de la Toussaint');
  assert.ok(Avatar.validate({ ...base, espece: 'fantome' }, 5, [badge('toussaint', 1)]));
  assert.ok(Avatar.validate({ ...base, espece: 'golem' }, 5, [badge('profondeur-650', 1)]));
  assert.equal(Avatar.validate({ ...base, compagnon: 'chauve-souris' }, 5, []), null);
});

test('avatar : nouveaux personnages et auras débloqués par les bons badges', () => {
  const base = Avatar.defaultAvatar(5);
  const badge = (id) => ({ id, name: id, description: 'd', count: 1 });
  const cases = [['espece', 'champignon', 'serie-7'], ['espece', 'ver-luisant', 'sainte-barbe'], ['espece', 'diablotin', 'cranes-25'], ['espece', 'grenouille', 'jour-terre'], ['dos', 'ailes-dragon', 'profondeur-700'], ['aura', 'givre', 'noel']];
  for (const [slot, id, need] of cases) {
    assert.equal(Avatar.validate({ ...base, [slot]: id }, 5, []), null, `${slot}:${id} verrouillé`);
    assert.ok(Avatar.validate({ ...base, [slot]: id }, 5, [badge(need)]), `${slot}:${id} avec ${need}`);
  }
  assert.ok(Avatar.validate({ ...base, iris: 'vairons', dos: 'ailes-fee' }, 5, []), 'yeux vairons et ailes de fée libres');
});

test('avatar : tenue d\'origine de chaque type et modèles de robots, que des éléments qui existent', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const win = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'avatar.js'), 'utf8'), { window: win, document: {} });
  const { STORIES, MODELS } = win.Avatar;
  for (const [id] of Avatar.OPTIONS.espece) {
    assert.ok(STORIES[id] && STORIES[id].text, `histoire de ${id}`);
    for (const [slot, value] of Object.entries(STORIES[id].preset)) {
      assert.ok(Avatar.OPTIONS[slot].some(([v]) => v === value), `${id} : ${slot}=${value} inconnu`);
    }
  }
  for (const [id] of Avatar.OPTIONS.modele) assert.ok(MODELS[id], `modèle ${id}`);
  const base = Avatar.defaultAvatar(5);
  assert.equal(Avatar.validate({ ...base, espece: 'robot', modele: 'cyclope' }, 5, []).modele, 'cyclope');
  assert.equal(Avatar.validate({ ...base, espece: 'robot', modele: 'blinde' }, 5, []), null, 'sentinelle blindée : badge de duel');
});

test('avatar : les vignettes des types ne dépendent pas du personnage en cours', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const win = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'avatar.js'), 'utf8'), { window: win, document: {} });
  const { thumb } = win.Avatar;
  assert.equal(thumb('humain').barbe, 'aucune', 'pas de barbe de nain sur la vignette humaine');
  assert.equal(thumb('nain').barbe, 'tressee');
  assert.equal(thumb('robot').espece, 'robot');
  // Ni la tenue d'origine ni la vignette ne touchent à la barbe, à la couleur de cheveux ni aux yeux d'un joueur.
  for (const [id, story] of Object.entries(win.Avatar.STORIES)) {
    for (const slot of ['barbe', 'couleur', 'yeux', 'cheveux']) assert.ok(!(slot in story.preset), `${id} : ${slot} dans la tenue d'origine`);
  }
});

test('avatar : le vestiaire 16-bit reste réservé au responsable pendant la bêta de la refonte', () => {
  const base = Avatar.defaultAvatar(5);
  const nain = { ...base, espece: 'nain' };
  assert.deepEqual(Avatar.validate(nain, 5, [], true, true), nain);
  assert.equal(Avatar.validate(nain, 5, [], true, false), null);
  assert.ok(Avatar.validate(base, 5, [], true, false));
  assert.ok(!Avatar.catalog([], true, false).espece.options.some((o) => o.id === 'nain'));
  // Les éléments déjà ouverts à tous avant la refonte restent visibles.
  assert.ok(Avatar.catalog([], true, false).chapeau.options.some((o) => o.id === 'viking'));
});
