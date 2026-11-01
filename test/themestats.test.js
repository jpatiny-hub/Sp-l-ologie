'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, answerFor } = require('./helpers');

test('onglet Thèmes : réussite, refus et détail par joueur, illimité compris, réservé au responsable', async () => {
  const app = await startServer();
  try {
    const adam = client(app.base);
    const eve = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    await eve('/api/signup', { username: 'eve', password: 'secret123' });
    assert.equal((await eve('/api/admin/themes/stats')).status, 403);

    // Forage du jour : deux refus puis une bonne réponse, puis un thème passé.
    const g = (await eve('/api/game/start', { mode: 'daily' })).data;
    await eve(`/api/game/${g.id}/reveal`, {});
    const first = app.db.prepare('SELECT theme_id FROM rounds WHERE game_id = ? AND slot = 0').get(g.id).theme_id;
    assert.equal((await eve(`/api/game/${g.id}/answer`, { text: 'zzqxw plouf' })).data.result, 'unknown');
    await eve(`/api/game/${g.id}/answer`, { text: 'qqvvzz' });
    app.clock.now += 5000;
    assert.equal((await eve(`/api/game/${g.id}/answer`, { text: answerFor(app.db, g.id, 1) })).data.result, 'ok');
    await eve(`/api/game/${g.id}/reveal`, {});
    const second = app.db.prepare('SELECT theme_id FROM rounds WHERE game_id = ? AND slot = 1').get(g.id).theme_id;
    await eve(`/api/game/${g.id}/skip`, {});

    // Illimité : un refus puis passé ; la partie suivante efface la première, le suivi reste.
    const t = (await eve('/api/game/start', { mode: 'training' })).data;
    await eve(`/api/game/${t.id}/reveal`, {});
    const tTheme = app.db.prepare('SELECT theme_id FROM rounds WHERE game_id = ? AND slot = 0').get(t.id).theme_id;
    await eve(`/api/game/${t.id}/answer`, { text: 'nimporte quoi xyz' });
    await eve(`/api/game/${t.id}/skip`, {});
    await eve('/api/game/start', { mode: 'training' });

    const all = (await adam('/api/admin/themes/stats?days=7')).data.themes;
    const a = all.find((x) => x.themeId === first);
    assert.equal(a.found, 1);
    assert.equal(a.triesPerPlay, 2);
    assert.ok(a.medianMs >= 5000);
    const b = all.find((x) => x.themeId === second);
    assert.ok(b.skipped + b.joker >= 1);
    assert.ok(all.some((x) => x.themeId === tTheme && x.modes.training === 1), "l'illimité est gardé");

    const daily = (await adam('/api/admin/themes/stats?days=7&mode=daily')).data.themes;
    assert.ok(!daily.some((x) => x.themeId === tTheme && !x.modes.daily));

    const d = (await adam(`/api/admin/themes/stats?days=7&themeId=${encodeURIComponent(first)}`)).data;
    assert.deepEqual(d.history[0].tries, ['zzqxw plouf', 'qqvvzz']);
    assert.equal(d.history[0].username, 'eve');
    assert.equal(d.refused.length, 2);
    assert.equal(d.accepted[0].count, 1);
    assert.equal((await adam('/api/admin/themes/stats?themeId=inconnu')).status, 404);
  } finally {
    await app.close();
  }
});
