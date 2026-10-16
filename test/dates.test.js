'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { dayKey, weekStart, addDays, msUntilNextDay } = require('../src/dates');

test('le jour change à minuit heure de Bruxelles', () => {
  // 16 oct. 2026, 21 h 59 UTC = 23 h 59 à Bruxelles (heure d'été, UTC+2).
  assert.equal(dayKey(Date.UTC(2026, 9, 16, 21, 59)), '2026-10-16');
  assert.equal(dayKey(Date.UTC(2026, 9, 16, 22, 1)), '2026-10-17');
  // En hiver (UTC+1).
  assert.equal(dayKey(Date.UTC(2026, 11, 31, 23, 30)), '2027-01-01');
});

test('la semaine commence le lundi', () => {
  assert.equal(weekStart('2026-10-16'), '2026-10-12'); // vendredi → lundi
  assert.equal(weekStart('2026-10-12'), '2026-10-12');
  assert.equal(weekStart('2026-10-18'), '2026-10-12'); // dimanche
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('compte à rebours jusqu’au prochain jour, y compris au changement d’heure', () => {
  assert.equal(msUntilNextDay(Date.UTC(2026, 9, 16, 21, 0)), 3600 * 1000);
  // Nuit du 24 au 25 octobre 2026 : passage à l'heure d'hiver (journée de 25 h).
  const midnight = Date.UTC(2026, 9, 24, 22, 0);
  assert.equal(msUntilNextDay(midnight), 25 * 3600 * 1000);
});
