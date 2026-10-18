'use strict';

const { TIMEZONE } = require('./config');

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function parts(ms) {
  return Object.fromEntries(dayFormat.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
}

/** Jour courant à Bruxelles, au format AAAA-MM-JJ. */
function dayKey(ms) {
  const p = parts(ms);
  return `${p.year}-${p.month}-${p.day}`;
}

function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lundi de la semaine contenant `day`. */
function weekStart(day) {
  const d = new Date(`${day}T12:00:00Z`);
  return addDays(day, -((d.getUTCDay() + 6) % 7));
}

/** Premier jour du mois contenant `day`. */
function monthStart(day) {
  return `${day.slice(0, 7)}-01`;
}

/** Même jour décalé de `n` mois, ramené au 1er du mois. */
function addMonths(day, n) {
  const d = new Date(`${monthStart(day)}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** Dernier jour du mois contenant `day`. */
function monthEnd(day) {
  return addDays(addMonths(day, 1), -1);
}

/** Millisecondes avant le prochain changement de jour à Bruxelles. */
function msUntilNextDay(ms) {
  const today = dayKey(ms);
  // Recherche dichotomique : robuste aux changements d'heure (journées de 23 h ou 25 h).
  let lo = ms;
  let hi = ms + 26 * 3600 * 1000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (dayKey(mid) === today) lo = mid;
    else hi = mid;
  }
  return hi - ms;
}

function isDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
}

module.exports = { dayKey, addDays, weekStart, monthStart, addMonths, monthEnd, msUntilNextDay, isDay };
