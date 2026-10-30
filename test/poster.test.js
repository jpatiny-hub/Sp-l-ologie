'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');

test("l'affiche du 31 octobre se dessine entièrement, de façon identique à chaque fois", () => {
  const paint = () => {
    const pixels = new Uint8ClampedArray(200 * 120 * 4);
    const ctx = { createImageData: () => ({ data: pixels }), putImageData() {} };
    const canvas = { width: 200, height: 120, getContext: () => ctx };
    const window = {};
    vm.runInNewContext(read('poster.js'), { window });
    window.Poster.draw(canvas);
    return pixels;
  };
  const first = paint();
  for (let i = 3; i < first.length; i += 4) assert.equal(first[i], 255, 'chaque point de l\'affiche est peint');
  const colors = new Set();
  for (let i = 0; i < first.length; i += 4) colors.add((first[i] << 16) | (first[i + 1] << 8) | first[i + 2]);
  assert.ok(colors.size > 30, "l'affiche utilise une vraie palette");
  assert.deepEqual(paint(), first, 'dessin identique à chaque ouverture');
});

test("l'affiche est branchée dans la page et dans l'application", () => {
  const html = read('index.html');
  const app = read('app.js');
  assert.match(html, /<script src="poster\.js"><\/script>/);
  assert.ok(html.indexOf('poster.js') < html.indexOf('src="app.js"'), "poster.js se charge avant app.js");
  for (const id of ['poster-dialog', 'poster-canvas', 'poster-close', 'poster-card', 'poster-card-canvas']) {
    assert.match(html, new RegExp(`id="${id}"`), `#${id} manque dans index.html`);
    assert.match(app, new RegExp(`'${id}'`), `#${id} n'est pas utilisé par app.js`);
  }
  assert.match(app, /Poster\.draw\(/);
  assert.match(app, /app\.me\.skullDay/, "l'affiche ne s'affiche que les jours de collection");
});
