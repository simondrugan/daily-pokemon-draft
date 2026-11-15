import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTestData } from './helpers.js';
import { generateDraft, dailySeed, teamCoverage, defensiveProfile } from '../public/js/draft.js';

const data = loadTestData();

test('the same seed always gives the same draft', () => {
  assert.deepEqual(generateDraft(data, 123), generateDraft(data, 123));
  assert.notDeepEqual(generateDraft(data, 123), generateDraft(data, 124));
  assert.equal(dailySeed('2026-01-01'), dailySeed('2026-01-01'));
  assert.notEqual(dailySeed('2026-01-01'), dailySeed('2026-01-02'));
});

test('drafts have the configured shape, no repeats, and usable move sets', () => {
  const { rounds, optionsPerRound, movesPerCreature } = data.settings.draft;
  for (let seed = 0; seed < 200; seed++) {
    const draft = generateDraft(data, seed);
    assert.equal(draft.length, rounds);
    const seen = new Set();
    for (const round of draft) {
      assert.equal(round.length, optionsPerRound);
      for (const opt of round) {
        assert.ok(!seen.has(opt.creature));
        seen.add(opt.creature);
        const c = data.creatureById[opt.creature];
        assert.equal(opt.moves.length, movesPerCreature);
        assert.equal(new Set(opt.moves).size, movesPerCreature);
        for (const m of opt.moves) assert.ok(c.movePool.includes(m));
        assert.ok(opt.moves.some((m) => data.moveById[m].category !== 'status'), 'needs an attack');
      }
    }
  }
});

test('coverage and defensive profile agree with the type chart', () => {
  const p = defensiveProfile(data, ['fire', 'stone']);
  assert.ok(p.weak.includes('water'));
  assert.ok(p.resist.includes('fire'));
  const cov = teamCoverage(data, [{ creature: 'kilnback', moves: ['ember'] }]);
  const water = cov.find((c) => c.type === 'water');
  assert.equal(water.weak, 1);
  assert.equal(cov.find((c) => c.type === 'plant').canHit, true);
});
