'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 32;

async function hashSecret(secret) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(secret, salt, KEY_LENGTH, SCRYPT_PARAMS);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verifySecret(secret, stored) {
  const [alg, salt, expected] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !expected) return false;
  const hash = await scrypt(secret, Buffer.from(salt, 'base64'), KEY_LENGTH, SCRYPT_PARAMS);
  const target = Buffer.from(expected, 'base64');
  return target.length === hash.length && crypto.timingSafeEqual(hash, target);
}

function newSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Sans caractères ambigus (0/O, 1/I/L).
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function newRecoveryCode() {
  const groups = [];
  for (let g = 0; g < 3; g++) {
    let s = '';
    for (let i = 0; i < 4; i++) s += RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)];
    groups.push(s);
  }
  return groups.join('-');
}

function normalizeRecoveryCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function usernameKey(username) {
  return String(username).normalize('NFC').toLowerCase();
}

function validateUsername(username) {
  if (typeof username !== 'string') return 'Identifiant manquant.';
  const value = username.normalize('NFC').trim();
  if (!/^[\p{L}\p{N}_.-]{3,20}$/u.test(value)) {
    return "L'identifiant doit faire de 3 à 20 caractères : lettres, chiffres, « _ », « - » ou « . ».";
  }
  return null;
}

function validatePassword(password) {
  // Seuls les nouveaux mots de passe sont concernés : la connexion ne vérifie pas la longueur (les anciens restent valables).
  if (typeof password !== 'string' || password.length < 8) return 'Le mot de passe doit faire au moins 8 caractères.';
  if (password.length > 200) return 'Le mot de passe est trop long.';
  return null;
}

/** Limiteur simple en mémoire : au plus `max` échecs par clé sur `windowMs`. */
class RateLimiter {
  constructor(max, windowMs) {
    this.max = max;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  blocked(key, now) {
    const entry = this.hits.get(key);
    if (!entry || now - entry.start > this.windowMs) return false;
    return entry.count >= this.max;
  }

  fail(key, now) {
    const entry = this.hits.get(key);
    if (!entry || now - entry.start > this.windowMs) this.hits.set(key, { start: now, count: 1 });
    else entry.count++;
    if (this.hits.size > 10000) this.hits.clear();
  }

  reset(key) {
    this.hits.delete(key);
  }
}

module.exports = {
  hashSecret,
  verifySecret,
  newSessionToken,
  hashToken,
  newRecoveryCode,
  normalizeRecoveryCode,
  usernameKey,
  validateUsername,
  validatePassword,
  RateLimiter,
};
