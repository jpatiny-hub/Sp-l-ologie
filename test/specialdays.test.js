'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startServer, client, THEMES } = require('./helpers');
const { loadSpecialDays, seasonFor } = require('../src/specialdays');

const ids = [...THEMES.values()].filter((t) => t.answers.length >= 20).slice(0, 7).map((t) => t.id);

test('jour spécial : les 7 thèmes sont imposés, dans l\'ordre, et l\'entraînement les évite', async () => {
  const special = new Map([['2026-10-14', { name: 'Test', themes: ids }]]);
  const app = await startServer({ specialDays: special, seasons: [{ id: 'test', from: '2026-10-14', to: '2026-10-15' }] });
  try {
    const adam = client(app.base);
    await adam('/api/signup', { username: 'adam', password: 'secret123' });
    const game = (await adam('/api/game/start', { mode: 'daily' })).data;
    const themes = app.db.prepare('SELECT theme_id FROM rounds WHERE game_id = ? ORDER BY slot').all(game.id).map((r) => r.theme_id);
    assert.deepEqual(themes, ids);
    const training = (await adam('/api/game/start', { mode: 'training' })).data;
    const trainThemes = app.db.prepare('SELECT theme_id FROM rounds WHERE game_id = ?').all(training.id).map((r) => r.theme_id);
    assert.equal(trainThemes.some((t) => ids.includes(t)), false, 'pas d\'entraînement sur les thèmes du jour');
    assert.equal((await adam('/api/me')).data.season, 'test');
    app.clock.now += 3 * 24 * 3600 * 1000;
    assert.equal((await adam('/api/me')).data.season, null, 'hors période');
  } finally {
    await app.close();
  }
});

test('jours spéciaux : une entrée incomplète est ignorée, une saison se calcule d\'après le jour', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spl-special-'));
  const file = path.join(dir, 'special.json');
  fs.writeFileSync(file, JSON.stringify({ '2026-10-31': { name: 'Halloween', themes: ids.slice(0, 3) }, '2026-11-01': { name: 'Ok', themes: ids } }));
  const days = loadSpecialDays(file, THEMES);
  assert.equal(days.has('2026-10-31'), false, 'trois thèmes seulement : ignoré');
  assert.deepEqual(days.get('2026-11-01').themes, ids);
  assert.equal(loadSpecialDays(path.join(dir, 'absent.json'), THEMES).size, 0);
  const seasons = [{ id: 'halloween', from: '2026-10-25', to: '2026-11-01' }];
  assert.equal(seasonFor('2026-10-24', seasons), null);
  assert.equal(seasonFor('2026-10-25', seasons), 'halloween');
  assert.equal(seasonFor('2026-11-01', seasons), 'halloween');
  assert.equal(seasonFor('2026-11-02', seasons), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('saisons : Halloween du 24 octobre à 2 h au 31 octobre, Toussaint le 1er novembre, automne ensuite jusqu\'au 30 novembre', () => {
  const { SEASONS } = require('../src/config');
  const { dayKey } = require('../src/dates');
  const at = (...utc) => seasonFor(dayKey(Date.UTC(...utc)), SEASONS);
  assert.equal(at(2026, 9, 23, 23, 59), null, '1 h 59 le 24 octobre : encore le jour précédent');
  assert.equal(at(2026, 9, 24, 0, 0), 'halloween', '2 h le 24 octobre (UTC+2) : le décor commence');
  assert.equal(at(2026, 9, 31, 12, 0), 'halloween');
  assert.equal(at(2026, 10, 1, 0, 59), 'halloween', '1 h 59 le 1er novembre (UTC+1) : toujours le 31');
  assert.equal(at(2026, 10, 1, 1, 0), 'toussaint', '2 h le 1er novembre : Toussaint');
  assert.equal(at(2026, 10, 2, 0, 59), 'toussaint', '1 h 59 le 2 novembre : encore la Toussaint');
  assert.equal(at(2026, 10, 2, 1, 0), 'automne', '2 h le 2 novembre : l\'automne commence');
  assert.equal(at(2026, 10, 30, 12, 0), 'automne');
  assert.equal(at(2026, 11, 1, 1, 0), null, '2 h le 1er décembre : retour au décor habituel');
});
