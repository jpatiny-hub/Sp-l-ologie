'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client } = require('./helpers');
const Drills = require('../src/drills');

test('foreuses 16-bit : déduites de l\'ancienne foreuse tant que le joueur n\'est pas passé à l\'Atelier', () => {
  assert.equal(Drills.drillOf({ skin_body: 'classique', skin_bit: 'standard' }), 'chantier/aucun/spirale');
  assert.equal(Drills.drillOf({ skin_body: 'cuivre', skin_bit: 'diamant' }), 'vapeur/aucun/couronne');
  assert.equal(Drills.drillOf({ skin_body: 'citrouille', skin_bit: 'tariere' }), 'citrouille');
  assert.equal(Drills.drillOf({ skin_body: 'cuivre', drill16: 'neon/plaques/plasma' }), 'neon/plaques/plasma');
  assert.equal(Drills.drillOf({ drill16: 'n/importe/quoi' }), 'chantier/aucun/spirale', 'valeur inconnue : foreuse de base');
  assert.equal(Drills.drillOf(null), 'chantier/aucun/spirale');
  // Chaque ancienne apparence débloquée donne des pièces débloquées par les mêmes badges.
  const { BODIES, BITS, CATALOG } = require('../src/badges');
  const gained = new Map();
  for (const [kind, def] of CATALOG) if (def.unlock) gained.set(`${def.unlock.type}:${def.unlock.id}`, kind);
  for (const [body] of BODIES) for (const [bit] of BITS) {
    const badges = [gained.get(`body:${body}`), gained.get(`bit:${bit}`)].filter(Boolean).map((id) => ({ id, name: id, description: '', count: 1 }));
    assert.ok(Drills.allowed(Drills.fromSkin(body, bit), Drills.catalog(badges)), `${body} + ${bit}`);
  }
});

test('Atelier : on ne monte que des pièces débloquées, et le choix suit le joueur', async () => {
  const app = await startServer();
  try {
    app.clock.now = Date.UTC(2026, 10, 2, 10, 0);
    const ana = client(app.base);
    await ana('/api/signup', { username: 'ana', password: 'secret123' });
    assert.equal((await ana('/api/me')).data.drill16, 'chantier/aucun/spirale');
    const profile = (await ana('/api/profile')).data;
    assert.equal(profile.drill16, 'chantier/aucun/spirale');
    assert.ok(profile.drillCatalog.styles.find((s) => s.id === 'chantier').unlocked);
    const locked = profile.drillCatalog.styles.find((s) => s.id === 'vapeur');
    assert.equal(locked.unlocked, false);
    assert.match(locked.hint, /Badge/);

    assert.equal((await ana('/api/profile/drill16', { drill: 'chantier/plaques/fraise' })).status, 403, 'fraise à dents pas encore gagnée');
    assert.equal((await ana('/api/profile/drill16', { drill: 'chaudron' })).status, 403, 'foreuse de fête pas encore gagnée');
    assert.equal((await ana('/api/profile/drill16', { drill: 'chantier/plaques/inconnu' })).status, 403);
    const ok = await ana('/api/profile/drill16', { drill: 'chantier/plaques/spirale' });
    assert.equal(ok.status, 200);
    assert.equal((await ana('/api/me')).data.drill16, 'chantier/plaques/spirale');
  } finally {
    await app.close();
  }
});
