'use strict';

// Réinitialise le mot de passe d'un joueur (si ni le mot de passe ni le code de récupération ne sont connus).
// Usage : npm run password:reset -- <identifiant>
// Affiche un mot de passe temporaire et un nouveau code de récupération à transmettre au joueur.

const crypto = require('node:crypto');
const path = require('node:path');
const config = require('../src/config');
const { openDb } = require('../src/db');
const auth = require('../src/auth');

async function main() {
  const username = process.argv[2];
  if (!username) {
    console.error('Usage : npm run password:reset -- <identifiant>');
    process.exit(1);
  }
  const db = openDb(path.join(config.DATA_DIR, 'speleologie.sqlite'));
  const user = db.prepare('SELECT id, username FROM users WHERE username_key = ?').get(auth.usernameKey(username));
  if (!user) {
    console.error(`Aucun joueur « ${username} ».`);
    process.exit(1);
  }
  const password = crypto.randomBytes(6).toString('base64url');
  const recoveryCode = auth.newRecoveryCode();
  db.prepare('UPDATE users SET password_hash = ?, recovery_hash = ? WHERE id = ?').run(
    await auth.hashSecret(password),
    await auth.hashSecret(auth.normalizeRecoveryCode(recoveryCode)),
    user.id,
  );
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  console.log(`Joueur : ${user.username}`);
  console.log(`Mot de passe temporaire : ${password}`);
  console.log(`Nouveau code de récupération : ${recoveryCode}`);
}

main();
