import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTestData } from './helpers.js';
import { createBattle, runTurn, forceSwitch, calcDamage, living, activeOf, stageMult } from '../public/js/engine.js';
import { chooseAction, chooseSwitch } from '../public/js/ai.js';
import { generateDraft } from '../public/js/draft.js';
import { makeRng } from '../public/js/rng.js';

const data = loadTestData();
const team = (seed) => generateDraft(data, seed).map((round) => round[0]);

test('super-effective hits do double damage and same-type attacks get a bonus', () => {
  const state = createBattle(data, [{ creature: 'brinejaw', moves: ['surge', 'bolt'] }], 1);
  const me = activeOf(state, 'player');
  const fire = { ...me, types: ['fire'] };
  const neutral = { ...me, types: ['beast'] };
  const opts = { crit: false, roll: 1 };
  const strong = calcDamage(state, me, fire, data.moveById['surge'], opts).damage;
  const plain = calcDamage(state, me, neutral, data.moveById['surge'], opts).damage;
  assert.ok(Math.abs(strong - plain * 2) <= 2);
  const offType = calcDamage(state, me, neutral, data.moveById['bolt'], opts).damage;
  assert.ok(plain > offType, 'same-type bonus applies');
  assert.equal(calcDamage(state, me, { ...me, types: ['shadow'] }, data.moveById['tackle'], opts).damage, 0);
});

test('stat stages scale symmetrically', () => {
  assert.equal(stageMult(2), 2);
  assert.equal(stageMult(-2), 0.5);
  assert.equal(stageMult(0), 1);
});

test('battles are deterministic for a given seed and actions', () => {
  const run = () => {
    const s = createBattle(data, team(5), 99);
    const log = [];
    for (let i = 0; i < 5 && s.phase === 'choose'; i++) {
      log.push(runTurn(s, { type: 'move', index: 0 }, chooseAction(s), chooseSwitch));
    }
    return JSON.stringify(log);
  };
  assert.equal(run(), run());
});

test('random battles always finish with a winner and consistent state', () => {
  for (let seed = 0; seed < 300; seed++) {
    const rng = makeRng(seed + 1000);
    const state = createBattle(data, team(seed), seed);
    let guard = 0;
    while (state.phase !== 'over') {
      assert.ok(++guard < 2000, `battle ${seed} did not finish`);
      if (state.phase === 'forceSwitch') {
        forceSwitch(state, rng.pick(living(state, 'player')));
        continue;
      }
      const bench = living(state, 'player').filter((i) => i !== state.sides.player.active);
      const action = bench.length && rng.chance(10)
        ? { type: 'switch', index: rng.pick(bench) }
        : { type: 'move', index: rng.int(activeOf(state, 'player').moves.length) };
      const events = runTurn(state, action, chooseAction(state), chooseSwitch);
      assert.ok(events.length > 0);
      for (const side of ['player', 'foe']) {
        for (const f of state.sides[side].team) assert.ok(f.hp >= 0 && f.hp <= f.maxHp);
      }
    }
    assert.ok(['player', 'foe'].includes(state.winner));
    assert.equal(living(state, state.winner === 'player' ? 'foe' : 'player').length, 0);
  }
});

test('a switch cannot target a fainted creature or the active one', () => {
  const state = createBattle(data, team(1), 1);
  assert.throws(() => runTurn(state, { type: 'switch', index: 0 }, { type: 'move', index: 0 }));
});
