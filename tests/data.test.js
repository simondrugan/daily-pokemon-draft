import test from 'node:test';
import assert from 'node:assert/strict';
import { readRaw, loadTestData } from './helpers.js';
import { validate, effectiveness, describeMove } from '../public/js/data.js';

test('the shipped config files are valid', () => {
  assert.deepEqual(validate(readRaw()), []);
});

test('validation reports mistakes in plain language', () => {
  const raw = readRaw();
  raw.creatures.creatures[0].movePool.push('not-a-move');
  raw.moves.moves[0].type = 'banana';
  const errors = validate(raw);
  assert.ok(errors.some((e) => e.includes('not-a-move')));
  assert.ok(errors.some((e) => e.includes('banana')));
});

test('every type has at least one weakness and one strength', () => {
  const data = loadTestData();
  for (const t of data.types) {
    assert.ok(data.types.some((a) => effectiveness(data, a.id, [t.id]) > 1), `${t.id} has no weakness`);
    assert.ok(data.chart[t.id].strong.length > 0, `${t.id} is strong against nothing`);
  }
});

test('effectiveness multiplies across two types and respects immunity', () => {
  const data = loadTestData();
  assert.equal(effectiveness(data, 'water', ['fire', 'stone']), 4);
  assert.equal(effectiveness(data, 'water', ['fire', 'water']), 1);
  assert.equal(effectiveness(data, 'beast', ['shadow', 'mind']), 0);
});

test('every move can be described', () => {
  const data = loadTestData();
  for (const m of data.moves) assert.equal(typeof describeMove(m), 'string');
});
