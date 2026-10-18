'use strict';

const http = require('node:http');
const path = require('node:path');
const { createApp } = require('../server');
const { openDb } = require('../src/db');
const { loadThemes } = require('../src/themes');

const THEMES = loadThemes(path.join(__dirname, '..', 'data', 'themes'));

/** Démarre l'application sur un port libre, avec une horloge contrôlable. */
async function startServer(options = {}) {
  const clock = { now: Date.UTC(2026, 9, 14, 10, 0) }; // mercredi 14 octobre 2026
  const db = openDb(':memory:');
  const server = http.createServer(createApp({ db, themes: THEMES, now: () => clock.now, ...options }));
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { clock, db, base, close: () => new Promise((r) => server.close(r)) };
}

/** Client HTTP qui garde le cookie de session, comme un navigateur. */
function client(base) {
  let cookie = '';
  return async function call(pathname, body) {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    const opts = { headers };
    if (body !== undefined) {
      opts.method = 'POST';
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(base + pathname, opts);
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  };
}

/** Trouve une réponse valide (du niveau demandé) pour le thème actuellement révélé. */
function answerFor(db, gameId, level) {
  const round = db.prepare('SELECT theme_id FROM rounds WHERE game_id = ? AND answered_at IS NULL ORDER BY slot').get(gameId);
  const answers = THEMES.get(round.theme_id).answers;
  // Certains thèmes sautent un niveau : on prend le niveau disponible le plus proche en dessous
  // (ou, à défaut, le plus évident).
  const levels = [...new Set(answers.map((a) => a.level))].sort((x, y) => x - y);
  const available = levels.filter((l) => l <= level).pop() || levels[0];
  return answers.find((a) => a.level === available).label;
}

/** Joue le forage du jour en entier, une réponse du niveau `level` à chaque thème. */
async function playDaily(app, call, level = 1) {
  const { data: game } = await call('/api/game/start', { mode: 'daily' });
  let state = game;
  for (let i = 0; i < 7; i++) {
    await call(`/api/game/${game.id}/reveal`, {});
    state = (await call(`/api/game/${game.id}/answer`, { text: answerFor(app.db, game.id, level) })).data.state;
  }
  return state;
}

module.exports = { THEMES, startServer, client, answerFor, playDaily };
