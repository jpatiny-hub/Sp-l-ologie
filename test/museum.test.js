'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, playDaily, THEMES, validateDuels } = require('./helpers');

test('musée des pépites : les pépites du jour restent cachées jusqu\'au lendemain', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base);
    const eve = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    const state = await playDaily(app, adam, 5);
    const pepites = state.rounds.filter((r) => r.tier && r.tier.id === 'pepite').length;
    assert.ok(pepites > 0, 'des réponses rares du premier joueur sont des pépites');
    let m = (await eve('/api/museum')).data;
    assert.equal(m.total, 0, 'pas de pépite visible le jour même');
    assert.equal(m.todayCount, pepites);
    app.clock.now += 24 * 3600 * 1000;
    m = (await eve('/api/museum')).data;
    assert.equal(m.total, pepites);
    assert.equal(m.entries.length, pepites);
    assert.equal(m.players[0].username, 'adam');
    assert.equal(m.players[0].count, pepites);
    assert.ok(m.entries[0].answer && m.entries[0].theme);
    assert.equal(m.entries[0].me, false);
  } finally {
    await app.close();
  }
});

test('fil de nouvelles : événements récents, pépites annoncées sans dire laquelle', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await playDaily(app, adam, 5);
    const { events } = (await adam('/api/feed?limit=10')).data;
    assert.ok(events.length >= 2);
    assert.ok(events.every((e, i) => i === 0 || events[i - 1].ts >= e.ts), 'du plus récent au plus ancien');
    const pepite = events.find((e) => e.type === 'pepite');
    assert.ok(pepite && /pépite/.test(pepite.text));
    assert.equal(events.find((e) => e.type === 'badge') !== undefined, true, 'un badge de profondeur ou de pépite apparaît');
    assert.equal((await adam('/api/feed')).data.events.length <= 3, true, 'trois événements par défaut');
  } finally {
    await app.close();
  }
});

test('pépites de duel : décompte à part, musée et profil une fois le duel terminé', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base);
    const eve = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    const rare = (gameId, slot) => {
      const themeId = app.db.prepare('SELECT theme_id FROM rounds WHERE game_id = ? AND slot = ?').get(gameId, slot).theme_id;
      const answers = THEMES.get(themeId).answers;
      const top = Math.max(...answers.map((a) => a.level));
      return answers.find((a) => a.level === top).label;
    };
    const play = async (c, gameId) => {
      for (let i = 0; i < 7; i++) {
        await c(`/api/game/${gameId}/reveal`, {});
        await c(`/api/game/${gameId}/answer`, { text: rare(gameId, i) });
      }
      return app.db.prepare('SELECT points FROM rounds WHERE game_id = ? ORDER BY slot').all(gameId).map((r) => r.points);
    };
    const started = (await adam('/api/duels', { opponent: 'eve', mode: 'aise' })).data;
    const adamPoints = await play(adam, started.id);
    assert.ok(adamPoints.every((p) => p === 100), 'des réponses rares jamais données en duel sont des pépites');
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM answer_counts').get().n, 0, 'le décompte du forage du jour reste intact');
    // Duel pas terminé : rien au profil ni au musée.
    assert.equal((await adam('/api/profile')).data.stats.pepites, 0);
    assert.equal((await adam('/api/profile')).data.badges.find((b) => b.id === 'pensees-jumelles'), undefined, 'badge secret invisible tant qu\'il n\'est pas débloqué');
    const accepted = (await eve(`/api/duels/${started.duel.id}/accept`, {})).data;
    const evePoints = await play(eve, accepted.id);
    assert.ok(evePoints.every((p) => p === 100), 'si les deux joueurs trouvent la même pépite, ils l\'ont tous les deux');
    assert.equal((await adam('/api/profile')).data.stats.pepites, 0, 'les pépites de duel comptent après la validation du lendemain');
    await validateDuels(app, adam);
    assert.equal((await adam('/api/profile')).data.stats.pepites, 7);
    assert.equal((await eve('/api/profile')).data.stats.pepites, 7);
    const secret = (profile) => profile.badges.find((b) => b.id === 'pensees-jumelles');
    assert.equal(secret((await adam('/api/profile')).data).count, 1, 'badge secret débloqué');
    app.clock.now += 24 * 3600 * 1000;
    const m = (await eve('/api/museum')).data;
    assert.equal(m.total, 14);
    assert.ok(m.entries.every((e) => e.duel));
  } finally {
    await app.close();
  }
});
