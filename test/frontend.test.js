'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');

test('chaque Sound.xxx appelé par l\'application existe dans sound.js', () => {
  const app = read('app.js');
  const sound = read('sound.js');
  const used = new Set([...app.matchAll(/\bSound\.([a-zA-Z]+)\(/g)].map((m) => m[1]));
  assert.ok(used.size > 5, 'des appels sonores devraient être trouvés');
  for (const name of used) {
    assert.match(sound, new RegExp(`^    ${name}\\(`, 'm'), `Sound.${name} est appelé mais n'est pas défini`);
  }
});
