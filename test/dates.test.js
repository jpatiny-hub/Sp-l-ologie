'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { dayKey, weekStart, addDays, msUntilNextDay } = require('../src/dates');

test('le jour de jeu change à 2 h, heure de Bruxelles', () => {
  // 16 oct. 2026, 23 h 59 UTC = 1 h 59 à Bruxelles (heure d'été, UTC+2) : encore le 16.
  assert.equal(dayKey(Date.UTC(2026, 9, 16, 23, 59)), '2026-10-16');
  assert.equal(dayKey(Date.UTC(2026, 9, 17, 0, 1)), '2026-10-17');
  // Minuit passé : toujours la journée précédente.
  assert.equal(dayKey(Date.UTC(2026, 9, 16, 22, 30)), '2026-10-16');
  // En hiver (UTC+1) : 1 h 30 le 1er janvier est encore le 31 décembre.
  assert.equal(dayKey(Date.UTC(2027, 0, 1, 0, 30)), '2026-12-31');
  assert.equal(dayKey(Date.UTC(2027, 0, 1, 1, 30)), '2027-01-01');
});

test('la semaine commence le lundi', () => {
  assert.equal(weekStart('2026-10-16'), '2026-10-12'); // vendredi → lundi
  assert.equal(weekStart('2026-10-12'), '2026-10-12');
  assert.equal(weekStart('2026-10-18'), '2026-10-12'); // dimanche
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('compte à rebours jusqu’au prochain jour, y compris au changement d’heure', () => {
  assert.equal(msUntilNextDay(Date.UTC(2026, 9, 16, 23, 0)), 3600 * 1000);
  // Nuit du 24 au 25 octobre 2026 : passage à l'heure d'hiver (journée de 25 h).
  const start = Date.UTC(2026, 9, 25, 0, 0); // 2 h à Bruxelles, début du jour de 25 h
  assert.equal(msUntilNextDay(start), 25 * 3600 * 1000);
});
