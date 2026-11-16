import test from 'node:test';
import assert from 'node:assert/strict';
import { readRaw, loadTestData, readFixtureRaw, loadFixtureData } from './helpers.js';
import { validate, effectiveness, describeMove, UNSUPPORTED, isAttack } from '../public/js/data.js';

// --- Checks on the shipped game data (public/data/) ---

test('the shipped config files are valid', () => {
  assert.deepEqual(validate(readRaw()), []);
});

// A type may be strong against nothing (the owner's chart has "normal" like that),
// but every type must have at least one weakness so no creature is unbeatable.
test('every type in the shipped data has at least one weakness', () => {
  const data = loadTestData();
  for (const t of data.types) {
    assert.ok(data.types.some((a) => effectiveness(data, a.id, [t.id]) > 1), `${t.id} has no weakness`);
  }
});

test('every shipped move can be described without "undefined"', () => {
  const data = loadTestData();
  for (const m of data.moves) {
    const text = describeMove(m);
    assert.equal(typeof text, 'string');
    assert.ok(!text.includes('undefined'), `${m.id}: "${text}"`);
  }
});

test('every shipped creature has an icon file', async () => {
  const { existsSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { iconPath } = await import('../public/js/sprite.js');
  const data = loadTestData();
  for (const c of data.creatures) {
    const file = fileURLToPath(new URL('../public/' + iconPath(c), import.meta.url));
    assert.ok(existsSync(file), `${c.name} has no icon: expected public/${iconPath(c)} (run "npm run icons" to create a placeholder)`);
  }
});

// --- Rules, checked on the fixture data (tests/fixtures/) ---

test('the fixture data is valid', () => {
  assert.deepEqual(validate(readFixtureRaw()), []);
});

test('validation reports mistakes in plain language', () => {
  const raw = readFixtureRaw();
  raw.creatures.creatures[0].movePool.push('not-a-move');
  raw.moves.moves[0].type = 'banana';
  const errors = validate(raw);
  assert.ok(errors.some((e) => e.includes('not-a-move')));
  assert.ok(errors.some((e) => e.includes('banana')));
});

test('validation accepts every not-yet-supported name but still rejects made-up ones', () => {
  const withEffects = (effects) => {
    const raw = readFixtureRaw();
    raw.moves.moves.push({ id: 'probe', name: 'Probe', type: 'normal', category: 'status', power: 0, accuracy: null, effects });
    return validate(raw);
  };
  for (const type of UNSUPPORTED.effects) assert.deepEqual(withEffects([{ type }]), [], `effect "${type}"`);
  for (const status of UNSUPPORTED.statuses) assert.deepEqual(withEffects([{ type: 'status', status }]), [], `status "${status}"`);
  for (const stat of UNSUPPORTED.stats) {
    assert.deepEqual(withEffects([{ type: 'stage', target: 'foe', stat, stages: -1 }]), [], `stat "${stat}"`);
  }
  assert.ok(withEffects([{ type: 'wobble' }]).some((e) => e.includes('unknown effect type "wobble"')));
  assert.ok(withEffects([{ type: 'status', status: 'itchy' }]).some((e) => e.includes('unknown status "itchy"')));
  assert.ok(withEffects([{ type: 'stage', target: 'self', stat: 'luck', stages: 1 }]).some((e) => e.includes('unknown stat "luck"')));
});

test('attacks with no power are valid but are not counted as attacks', () => {
  const data = loadFixtureData();
  assert.equal(data.moveById['echo-back'].power, null);
  assert.equal(isAttack(data.moveById['echo-back']), false);
  assert.equal(isAttack(data.moveById['bonk']), true);
  assert.equal(isAttack(data.moveById['patch-up']), false);
  const raw = readFixtureRaw();
  raw.moves.moves.find((m) => m.id === 'bonk').power = 0;
  assert.deepEqual(validate(raw), []);
  raw.moves.moves.find((m) => m.id === 'bonk').power = -5;
  assert.ok(validate(raw).some((e) => e.includes('"bonk" power')));
});

test('move pools need at least one move, and creatures without attacks are allowed', () => {
  const raw = readFixtureRaw();
  assert.ok(raw.creatures.creatures.some((c) => c.movePool.length < raw.settings.draft.movesPerCreature));
  raw.creatures.creatures[0].movePool = [];
  assert.ok(validate(raw).some((e) => e.includes('"emberkit" movePool needs at least 1 move')));
});

test('the draft size check counts only creatures that have an attack', () => {
  const raw = readFixtureRaw();
  // 10 of the 11 fixture creatures have an attack; copyclay does not.
  raw.settings.draft.rounds = 5;
  raw.settings.draft.optionsPerRound = 2;
  assert.deepEqual(validate(raw), []);
  raw.settings.draft.optionsPerRound = 3;
  assert.ok(validate(raw).some((e) => e.includes('needs 15 creatures with at least one attack, but creatures.json only has 10')));
});

test('effectiveness multiplies across two types and respects immunity', () => {
  const data = loadFixtureData();
  assert.equal(effectiveness(data, 'water', ['fire', 'rock']), 4);
  assert.equal(effectiveness(data, 'water', ['fire', 'water']), 1);
  assert.equal(effectiveness(data, 'normal', ['ghost', 'psychic']), 0);
});

test('every fixture move can be described, and unsupported effects are flagged briefly', () => {
  const data = loadFixtureData();
  for (const m of data.moves) {
    const text = describeMove(m);
    assert.equal(typeof text, 'string');
    assert.ok(!text.includes('undefined'), `${m.id}: "${text}"`);
  }
  assert.equal(describeMove(data.moveById['fog-veil']), 'Special effect (not in battle yet)');
  assert.equal(describeMove(data.moveById['rime-spray']), 'Special effect (not in battle yet)');
  assert.equal(describeMove(data.moveById['cinder-flick']), '10% chance to burn the foe');
  assert.equal(describeMove(data.moveById['mimic-dance']), '');
});
