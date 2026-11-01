'use strict';

const { addDays, monthStart, monthEnd, addMonths, dayKey } = require('./dates');
const Avatar = require('./avatar');
const Gems = require('./gems');

/*
 * Défi collectif du mois : tous les joueurs percent ensemble une galerie jusqu'à un filon de pierres précieuses.
 * Depuis novembre 2026, l'objectif dépend du nombre de joueurs actifs (au moins 4 jours de forage le mois précédent) et
 * la nature du défi change d'un mois à l'autre (points, pépites, réponses Rubis, réponses valides, jours de forage) ; voir `src/gems.js`.
 * Avant, c'était « 10 000 points ». Rien n'est stocké : tout se calcule à partir des forages du mois,
 * y compris ceux joués avant la mise en place du défi.
 */
const GOAL = 10000;
// Défi duel du mois : le groupe termine ensemble ce nombre de duels avant la fin du mois (ancien défi, et part par joueur actif ensuite).
const DUEL_GOAL = 50;
const DUELS_PER_PLAYER = 4;

/** Joueurs actifs d'un mois : au moins ACTIVE_DAYS forages du jour le mois précédent. */
function activePlayers(db, month) {
  const prev = addMonths(month, -1);
  return db
    .prepare("SELECT COUNT(*) AS n FROM (SELECT user_id FROM games WHERE mode = 'daily' AND finished_at IS NOT NULL AND day BETWEEN ? AND ? GROUP BY user_id HAVING COUNT(*) >= ?)")
    .get(monthStart(prev), monthEnd(prev), Gems.ACTIVE_DAYS).n;
}

/** Valeurs du défi, par joueur et par jour : [{ userId, day, v }]. */
function measures(db, kind, start, end) {
  const where = "g.mode = 'daily' AND g.day BETWEEN ? AND ?";
  if (kind === 'points') return db.prepare(`SELECT g.user_id AS userId, g.day, g.score AS v FROM games g WHERE ${where}`).all(start, end);
  if (kind === 'jours') return db.prepare(`SELECT g.user_id AS userId, g.day, 1 AS v FROM games g WHERE ${where} AND g.finished_at IS NOT NULL`).all(start, end);
  const filter = kind === 'pepites' ? 'r.points >= 100' : kind === 'rubis' ? "r.outcome = 'answer' AND r.points >= 60" : "r.outcome = 'answer'";
  return db
    .prepare(`SELECT g.user_id AS userId, g.day, COUNT(*) AS v FROM rounds r JOIN games g ON g.id = r.game_id WHERE ${where} AND ${filter} GROUP BY g.user_id, g.day`)
    .all(start, end);
}

// Les mois passés ne bougent plus (sauf points accordés après coup) : leur résultat est gardé quelques minutes.
const pastCache = new WeakMap();
const PAST_TTL = 10 * 60 * 1000;

/** Résultat brut d'un mois (aussi pour les mois passés, qui servent à distribuer les récompenses). `past` : mois terminé, résultat gardé en mémoire. */
function monthResult(db, day, past = false) {
  const key = monthStart(day);
  if (past) {
    const hit = pastCache.get(db) && pastCache.get(db).get(key);
    if (hit && Date.now() - hit.at < PAST_TTL) return hit.value;
  }
  const value = computeMonth(db, day);
  if (past) {
    if (!pastCache.has(db)) pastCache.set(db, new Map());
    pastCache.get(db).set(key, { at: Date.now(), value });
  }
  return value;
}

function computeMonth(db, day) {
  const start = monthStart(day);
  const end = monthEnd(day);
  const gallery = Gems.galleryOn(start);
  const kind = gallery ? Gems.kindOf(start) : 'points';
  const active = gallery ? Math.max(Gems.MIN_PLAYERS, activePlayers(db, start)) : 0;
  const goal = gallery ? Gems.niceGoal(Gems.KINDS[kind].per * active) : GOAL;
  const rows = measures(db, kind, start, end);
  const perUser = new Map();
  const perDay = new Map();
  const days = new Map();
  let total = 0;
  for (const r of rows) {
    perUser.set(r.userId, (perUser.get(r.userId) || 0) + r.v);
    perDay.set(r.day, (perDay.get(r.day) || 0) + r.v);
    total += r.v;
  }
  for (const g of db.prepare("SELECT user_id AS userId, COUNT(*) AS n FROM games WHERE mode = 'daily' AND finished_at IS NOT NULL AND day BETWEEN ? AND ? GROUP BY user_id").all(start, end)) days.set(g.userId, g.n);
  let reachedOn = null;
  if (total >= goal) {
    let sum = 0;
    for (const d of [...perDay.keys()].sort()) {
      sum += perDay.get(d);
      if (sum >= goal) {
        reachedOn = d;
        break;
      }
    }
  }
  return { start, end, gallery, kind, active, goal, total, reached: total >= goal, reachedOn, perUser, days };
}

function collectiveStatus(db, today, userId) {
  const m = monthResult(db, today);
  const { start, end } = m;
  const names = new Map(db.prepare('SELECT id, username, avatar FROM users').all().map((u) => [u.id, u]));
  const players = [...m.perUser.entries()]
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, username: names.get(id).username, key: names.get(id).username.toLowerCase(), avatar: names.get(id).avatar, points: v }))
    .sort((a, b) => b.points - a.points || (a.key < b.key ? -1 : 1));
  const duels = db
    .prepare("SELECT challenger_id, opponent_id, finished_at FROM duels WHERE status = 'done' AND validated_at IS NOT NULL AND finished_at IS NOT NULL")
    .all()
    .filter((d) => dayKey(d.finished_at) >= start && dayKey(d.finished_at) <= end);
  const duelGoal = m.gallery ? Math.max(10, DUELS_PER_PLAYER * m.active) : DUEL_GOAL;
  const duel = { goal: duelGoal, total: duels.length, mine: duels.filter((d) => d.challenger_id === userId || d.opponent_id === userId).length, reached: duels.length >= duelGoal };
  const daysLeft = Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000) + 1;
  const out = {
    month: start.slice(0, 7),
    start,
    end,
    goal: m.goal,
    total: m.total,
    reached: m.reached,
    reachedOn: m.reachedOn,
    daysLeft,
    duel,
    players: players.map((r) => ({ username: r.username, avatar: Avatar.normalize(r.avatar, r.id), points: r.points, me: r.id === userId })),
  };
  if (m.gallery) {
    const gem = Gems.gemOf(start);
    const kind = Gems.KINDS[m.kind];
    out.gallery = {
      kind: m.kind,
      gem: gem.id,
      gemName: gem.name,
      one: gem.one,
      name: gem.gallery,
      trait: gem.trait,
      colors: { gem: gem.gem, deco: gem.deco, water: gem.water, wall: gem.wall, rock: gem.rock, glow: gem.glow },
      active: m.active,
      unit: kind.unit,
      title: kind.title(m.goal.toLocaleString('fr-BE')),
      filon: `${/^[aeiouyéèêàâ]/i.test(gem.name) ? "d'" : 'de '}${gem.name}`,
      note: kind.note,
      myDays: m.days.get(userId) || 0,
      minDays: Gems.MIN_DAYS,
    };
  }
  return out;
}

/**
 * Vitrine du minéralogiste : une étagère de 12 pierres, une par galerie du mois (à partir de novembre 2026).
 * États : found (filon atteint), current (en cours), missed (filon pas atteint à temps), future (pas encore ouverte).
 */
function showcase(db, today, userId) {
  const cur = monthStart(today);
  let m = monthStart(`${Gems.FIRST_MONTH}-01`);
  if (cur >= addMonths(m, 12)) m = addMonths(cur, -11);
  const out = [];
  for (let i = 0; i < 12; i++, m = addMonths(m, 1)) {
    const g = Gems.gemOf(m);
    const base = { month: m.slice(0, 7), name: g.one, gallery: g.gallery };
    if (m > cur) {
      out.push({ ...base, state: 'future', name: null, gallery: null });
      continue;
    }
    const res = monthResult(db, m, m < cur);
    const mine = res.reached && (res.days.get(userId) || 0) >= Gems.MIN_DAYS;
    out.push({ ...base, state: res.reached ? 'found' : m < cur ? 'missed' : 'current', gem: g.id, colors: g.gem, reachedOn: res.reachedOn, mine, myDays: res.days.get(userId) || 0, minDays: Gems.MIN_DAYS });
  }
  return out;
}

module.exports = { collectiveStatus, monthResult, showcase, GOAL };
