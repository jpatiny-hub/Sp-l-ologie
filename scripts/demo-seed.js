'use strict';

/*
 * Bac à sable de la bêta : remplit une base NEUVE avec un faux jeu (faux mineurs, forages des semaines passées, duels,
 * podiums de semaine et de mois) pour que le responsable essaie la refonte sans qu'aucun joueur ne la voie.
 * Ne touche jamais une base qui a déjà des comptes. Les parties sont jouées par l'application elle-même, avec une horloge
 * qu'on fait remonter dans le temps : tout (points, badges, podiums, duels) est calculé exactement comme en vrai.
 *
 *   DATA_DIR=… DEMO_PASSWORD=… [DEMO_USER=Jonas] [DEMO_INVITE=…] [DEMO_DAYS=45] node scripts/demo-seed.js
 *
 * Le compte DEMO_USER est créé en premier : il est donc responsable du jeu. DEMO_INVITE ferme l'inscription aux autres.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../src/config');
const { openDb } = require('../src/db');
const { loadThemes } = require('../src/themes');
const { createApp } = require('../server');
const Avatar = require('../src/avatar');

const DAY = 24 * 3600 * 1000;
const MINERS = ['Stalactite', 'MarieLune', 'ProfTaupe', 'Geode', 'Quentin', 'Ada', 'Brigitte', 'Lucien', 'Pepite'];

// Tirage reproductible : le même bac à sable à chaque démarrage.
let rand = 20261030;
const random = () => ((rand = (Math.imul(rand, 1103515245) + 12345) >>> 0) / 4294967296);
const pick = (list) => list[Math.floor(random() * list.length)];

async function main() {
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error('DEMO_PASSWORD manque : mot de passe du compte responsable du bac à sable.');
  const owner = process.env.DEMO_USER || 'Jonas';
  const days = Number(process.env.DEMO_DAYS) || 45;
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  const db = openDb(path.join(config.DATA_DIR, 'speleologie.sqlite'));
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) {
    console.log('Bac à sable : la base a déjà des comptes, rien à faire.');
    return db.close();
  }
  const themes = loadThemes(config.THEMES_DIR);
  const clock = { now: Date.now() - days * DAY };
  const server = http.createServer(createApp({ db, themes, now: () => clock.now }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  /** Client HTTP qui garde son cookie de session, comme un navigateur. */
  const client = () => {
    let cookie = '';
    return async (pathname, body) => {
      const headers = cookie ? { Cookie: cookie } : {};
      const opts = { headers };
      if (body !== undefined) Object.assign(opts, { method: 'POST', body: JSON.stringify(body) }, { headers: { ...headers, 'Content-Type': 'application/json' } });
      const res = await fetch(base + pathname, opts);
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      return { status: res.status, data: await res.json().catch(() => null) };
    };
  };
  /** Une réponse du thème en cours, plus ou moins rare selon le mineur (parfois ratée). */
  const answerFor = (gameId, skill) => {
    const round = db.prepare('SELECT theme_id FROM rounds WHERE game_id = ? AND answered_at IS NULL ORDER BY slot').get(gameId);
    if (!round) return null;
    if (random() < 0.06) return 'je ne sais pas';
    const answers = themes.get(round.theme_id).answers;
    const levels = [...new Set(answers.map((a) => a.level))].sort((a, b) => a - b);
    const want = Math.min(levels.length - 1, Math.floor(random() * random() * (levels.length + skill)));
    return pick(answers.filter((a) => a.level === levels[want])).label;
  };
  const play = async (call, gameId, skill) => {
    // Jusqu'à la fin de la partie (un joker peut remplacer un thème passé : il y a alors une manche de plus).
    const finished = () => db.prepare('SELECT finished_at FROM games WHERE id = ?').get(gameId).finished_at != null;
    for (let i = 0; i < 12 && !finished(); i++) {
      await call(`/api/game/${gameId}/reveal`, {});
      clock.now += (4 + random() * 14) * 1000;
      const text = answerFor(gameId, skill);
      if (text === null) break;
      await call(`/api/game/${gameId}/answer`, { text });
      // Réponse refusée : le mineur passe le thème (sans chrono en duel, il resterait ouvert).
      const open = db.prepare('SELECT 1 FROM rounds WHERE game_id = ? AND served_at IS NOT NULL AND answered_at IS NULL').get(gameId);
      if (open) await call(`/api/game/${gameId}/skip`, {});
      clock.now += 3000;
    }
  };

  // Comptes : le responsable d'abord (premier compte = responsable), puis les faux mineurs.
  const players = [{ name: owner, call: client(), skill: 2, assiduity: 0.6 }];
  for (const name of MINERS) players.push({ name, call: client(), skill: Math.floor(random() * 4), assiduity: 0.45 + random() * 0.5 });
  for (const p of players) {
    const res = await p.call('/api/signup', { username: p.name, password: p.name === owner ? password : `mineur-${p.name}-${random()}` });
    if (res.status >= 400) throw new Error(`Inscription de ${p.name} impossible : ${JSON.stringify(res.data)}`);
    if (p.name === owner) continue;
    // Un personnage tiré au hasard parmi les éléments libres (pas ceux du vestiaire 16-bit, réservés au responsable).
    const cat = Avatar.catalog([], true, false);
    const avatar = {};
    for (const [slot, { options }] of Object.entries(cat)) avatar[slot] = pick(options.filter((o) => o.unlocked)).id;
    await p.call('/api/profile/avatar', { avatar });
  }

  // Forages du jour des semaines passées, et ceux d'aujourd'hui des faux mineurs (le responsable garde le sien à jouer).
  for (let d = days; d >= 0; d--) {
    const day = new Date(Date.now() - d * DAY);
    const morning = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 7, 0);
    // Aujourd'hui : seulement des parties déjà terminées (avant maintenant, et après le changement de jour à 2 h).
    const span = d ? 12 * 3600 * 1000 : Math.max(0, Date.now() - 20 * 60 * 1000 - morning);
    for (const p of players) {
      if (random() > p.assiduity || (d === 0 && (p === players[0] || !span))) continue;
      clock.now = morning + random() * span;
      const { data } = await p.call('/api/game/start', { mode: 'daily' });
      if (data && data.id) await play(p.call, data.id, p.skill);
    }
    // Quelques duels entre mineurs, validés le lendemain par le contremaître.
    if (d % 4 === 0 && d > 0) {
      const [a, b] = [pick(players.slice(1)), pick(players.slice(1))];
      if (a !== b) {
        clock.now = morning + 13 * 3600 * 1000;
        const started = (await a.call('/api/duels', { opponent: b.name, mode: 'aise' })).data;
        if (started && started.id) {
          await play(a.call, started.id, a.skill);
          const accepted = (await b.call(`/api/duels/${started.duel.id}/accept`, {})).data;
          if (accepted && accepted.id) await play(b.call, accepted.id, b.skill);
        }
      }
    }
  }

  // Duels du responsable : un résultat à découvrir et un défi reçu qui l'attend.
  const me = players[0];
  clock.now = Date.now() - 2 * DAY;
  const rival = players[3];
  const mine = (await me.call('/api/duels', { opponent: rival.name, mode: 'aise' })).data;
  if (mine && mine.id) {
    await play(me.call, mine.id, me.skill);
    const acc = (await rival.call(`/api/duels/${mine.duel.id}/accept`, {})).data;
    if (acc && acc.id) await play(rival.call, acc.id, rival.skill);
  }
  clock.now = Date.now() - 3 * 3600 * 1000;
  const challenger = players[5];
  const waiting = (await challenger.call('/api/duels', { opponent: me.name, mode: 'aise' })).data;
  if (waiting && waiting.id) await play(challenger.call, waiting.id, challenger.skill);
  // Le contremaître valide les duels passés et attribue les podiums jusqu'à aujourd'hui.
  clock.now = Date.now();
  for (const p of players) await p.call('/api/duels');
  await me.call('/api/profile');

  if (process.env.DEMO_INVITE) db.prepare("INSERT INTO settings (key, value) VALUES ('invite_code', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(process.env.DEMO_INVITE);
  await new Promise((resolve) => server.close(resolve));
  const games = db.prepare("SELECT COUNT(*) AS n FROM games").get().n;
  console.log(`Bac à sable prêt : ${players.length} comptes, ${games} parties sur ${days} jours. Responsable : ${owner}.`);
  db.close();
}

main().then(() => process.exit(0), (err) => {
  console.error(err);
  process.exit(1);
});
