'use strict';

const fs = require('node:fs');
const { ROUNDS_PER_GAME } = require('./config');

/*
 * Jours aux thèmes imposés. data/special-days.json :
 *   { "2026-10-31": { "name": "Halloween", "themes": ["id-1", …, "id-7"] } }
 * Ce jour-là, les 7 thèmes sont ceux de la liste (dans cet ordre) au lieu d'un tirage ; ils peuvent être « actif: non »
 * dans leur fichier pour ne pas sortir les autres jours. Une entrée incomplète ou avec un thème inconnu est ignorée.
 */
function loadSpecialDays(file, themes) {
  const days = new Map();
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return days;
  }
  for (const [day, entry] of Object.entries(raw || {})) {
    const ids = entry && Array.isArray(entry.themes) ? entry.themes : [];
    const problems = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) problems.push('date invalide');
    if (ids.length !== ROUNDS_PER_GAME) problems.push(`${ids.length} thèmes au lieu de ${ROUNDS_PER_GAME}`);
    ids.filter((id) => !themes.get(id) || !themes.get(id).answers.length).forEach((id) => problems.push(`thème inconnu ou vide : ${id}`));
    if (new Set(ids).size !== ids.length) problems.push('thème en double');
    if (problems.length) {
      console.warn(`[jour spécial ${day}] ignoré : ${problems.join(', ')}`);
      continue;
    }
    days.set(day, { name: entry.name || day, themes: ids });
  }
  return days;
}

/** Décor de saison actif ce jour-là (identifiant), ou null. */
function seasonFor(day, seasons) {
  const s = seasons.find((x) => day >= x.from && day <= x.to);
  return s ? s.id : null;
}

module.exports = { loadSpecialDays, seasonFor };
