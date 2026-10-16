'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTheme } = require('../src/themes');
const { scoreAnswer, tierFor } = require('../src/scoring');

const theme = parseTheme(
  'test',
  `titre: Test
1: A1; A2; A3; A4; A5; A6; A7; A8
2: B1; B2; B3; B4; B5; B6; B7; B8; B9; B10
3: C1; C2; C3; C4; C5; C6; C7; C8; C9; C10; C11; C12
4: D1; D2; D3; D4; D5; D6; D7; D8; D9; D10; D11; D12
5: E1; E2; E3; E4; E5; E6; E7; E8; E9; E10; E11; E12`,
);
const key = (label) => theme.answers.find((a) => a.label === label).key;

test("sans données, les points suivent les niveaux de difficulté", () => {
  const counts = new Map();
  const points = ['A1', 'B1', 'C1', 'D1', 'E1'].map((l) => scoreAnswer(theme, counts, key(l)).points);
  assert.deepEqual(points, [10, 29, 48, 68, 100]);
  assert.ok(scoreAnswer(theme, counts, key('E1')).pepite);
});

test('une pépite déjà trouvée ne vaut plus 100 points, mais reste rare', () => {
  const counts = new Map([[key('E1'), 1]]);
  const s = scoreAnswer(theme, counts, key('E1'));
  assert.equal(s.pepite, false);
  assert.ok(s.points < 100 && s.points >= 60, `points = ${s.points}`);
});

test("plus une réponse est donnée, moins elle rapporte", () => {
  let previous = Infinity;
  for (const n of [0, 2, 10, 50, 200]) {
    const s = scoreAnswer(theme, new Map([[key('C1'), n]]), key('C1'));
    assert.ok(s.points <= previous, `n=${n} : ${s.points} > ${previous}`);
    previous = s.points;
  }
  assert.equal(previous, 10);
});

test("les réponses jamais données deviennent plus rares quand les données s'accumulent", () => {
  const before = scoreAnswer(theme, new Map(), key('D1')).points;
  const after = scoreAnswer(theme, new Map([[key('A1'), 400]]), key('D1')).points;
  assert.ok(after > before, `${after} <= ${before}`);
});

test('paliers de rareté', () => {
  assert.equal(tierFor(0, 'timeout').id, 'timeout');
  assert.equal(tierFor(0, 'skip').id, 'skip');
  assert.equal(tierFor(10, 'answer').id, 'evident');
  assert.equal(tierFor(29, 'answer').id, 'courant');
  assert.equal(tierFor(48, 'answer').id, 'original');
  assert.equal(tierFor(68, 'answer').id, 'rare');
  assert.equal(tierFor(90, 'answer').id, 'tres_rare');
  assert.equal(tierFor(100, 'answer').id, 'pepite');
});
