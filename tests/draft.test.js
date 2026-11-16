import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTestData, loadFixtureData } from './helpers.js';
import { generateDraft, rollMoves, dailySeed, teamCoverage, defensiveProfile } from '../public/js/draft.js';
import { isAttack, canBeDrafted } from '../public/js/data.js';
import { makeRng } from '../public/js/rng.js';

const fixture = loadFixtureData();

// Shared check: the draft has the configured shape, never repeats a creature, and every
// option has a usable move set (the whole pool when the pool is small, always an attack).
function checkDraftShape(data, seeds) {
  const { rounds, optionsPerRound, movesPerCreature } = data.settings.draft;
  for (let seed = 0; seed < seeds; seed++) {
    const draft = generateDraft(data, seed);
    assert.equal(draft.length, rounds);
    const seen = new Set();
    for (const round of draft) {
      assert.equal(round.length, optionsPerRound);
      for (const opt of round) {
        assert.ok(!seen.has(opt.creature), `seed ${seed}: ${opt.creature} offered twice`);
        seen.add(opt.creature);
        const c = data.creatureById[opt.creature];
        const expected = Math.min(movesPerCreature, c.movePool.length);
        assert.equal(opt.moves.length, expected, `seed ${seed}: ${opt.creature} move count`);
        assert.equal(new Set(opt.moves).size, expected);
        for (const m of opt.moves) assert.ok(c.movePool.includes(m));
        assert.ok(opt.moves.some((m) => isAttack(data.moveById[m])), `seed ${seed}: ${opt.creature} needs an attack`);
      }
    }
  }
}

test('the same seed always gives the same draft', () => {
  assert.deepEqual(generateDraft(fixture, 123), generateDraft(fixture, 123));
  assert.notDeepEqual(generateDraft(fixture, 123), generateDraft(fixture, 124));
  assert.equal(dailySeed('2026-01-01'), dailySeed('2026-01-01'));
  assert.notEqual(dailySeed('2026-01-01'), dailySeed('2026-01-02'));
});

test('fixture drafts have the configured shape, no repeats, and usable move sets', () => {
  checkDraftShape(fixture, 200);
});

test('shipped drafts have the configured shape, no repeats, and usable move sets', () => {
  const data = loadTestData();
  assert.deepEqual(generateDraft(data, 123), generateDraft(data, 123));
  checkDraftShape(data, 200);
});

test('a move pool smaller than movesPerCreature gives the whole pool', () => {
  const duck = fixture.creatureById['duoduck'];
  assert.ok(duck.movePool.length < fixture.settings.draft.movesPerCreature);
  for (let seed = 0; seed < 20; seed++) {
    const moves = rollMoves(fixture, duck, makeRng(seed));
    assert.deepEqual(moves.slice().sort(), duck.movePool.slice().sort());
    assert.equal(moves[0], 'bonk', 'the attack comes first');
  }
});

test('creatures with no attack are never offered in the draft', () => {
  assert.equal(canBeDrafted(fixture.creatureById['copyclay'], fixture.moveById), false);
  const offered = new Set();
  for (let seed = 0; seed < 300; seed++) {
    for (const round of generateDraft(fixture, seed)) for (const opt of round) offered.add(opt.creature);
  }
  assert.ok(!offered.has('copyclay'));
  // Every creature that does have an attack turns up at some point.
  for (const c of fixture.creatures) if (c.id !== 'copyclay') assert.ok(offered.has(c.id), `${c.id} never offered`);
});

test('coverage and defensive profile agree with the type chart', () => {
  const p = defensiveProfile(fixture, ['fire', 'rock']);
  assert.ok(p.weak.includes('water'));
  assert.ok(p.resist.includes('fire'));
  const cov = teamCoverage(fixture, [{ creature: 'cragmaw', moves: ['cinder-flick'] }]);
  const water = cov.find((c) => c.type === 'water');
  assert.equal(water.weak, 1);
  assert.equal(cov.find((c) => c.type === 'grass').canHit, true);
});

test('coverage ignores attacks with no power', () => {
  // hurl-gamble is a normal-type "attack" with no power; normal is strong against psychic.
  const cov = teamCoverage(fixture, [{ creature: 'sproutle', moves: ['hurl-gamble'] }]);
  assert.equal(cov.find((c) => c.type === 'psychic').canHit, false);
  const withBonk = teamCoverage(fixture, [{ creature: 'sproutle', moves: ['bonk'] }]);
  assert.equal(withBonk.find((c) => c.type === 'psychic').canHit, true);
});
