// Headless end-to-end test of the whole game flow on the SHIPPED data in public/data/:
// load and validate -> generate a draft -> pick a team -> battle the champion to the end.
// No browser and no dependencies. Unlike tests/engine.test.js (rule tests on the fixture,
// plus a quick random-battle smoke test), this mirrors what public/js/app.js does step by step,
// with several draft strategies and player policies, and checks the event stream the UI plays.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readRaw } from './helpers.js';
import { buildData, STATS } from '../public/js/data.js';
import { generateDraft, dailySeed } from '../public/js/draft.js';
import { createBattle, runTurn, forceSwitch, activeOf, living, calcDamage } from '../public/js/engine.js';
import { chooseAction, chooseSwitch } from '../public/js/ai.js';
import { makeRng, hashString } from '../public/js/rng.js';

// Same validation path as the game: loadData() fetches the files, then calls buildData().
const data = buildData(readRaw());

// A battle that runs longer than this is treated as stalled.
const TURN_LIMIT = 500;

// Event types that act() in public/js/app.js plays back (its if/else chain on `e.t`).
const PLAYED_EVENTS = new Set(['msg', 'hp', 'status', 'faint', 'switch', 'anim']);
// Event types the engine emits that act() in public/js/app.js deliberately has no branch for:
// 'stages' always comes with a msg describing the change, and the end of the battle is read
// from state.phase/state.winner rather than from 'over'. Anything else is unknown and fails.
const UNPLAYED_EVENTS = new Set(['stages', 'over']);

const SEEDS = [
  0, 1, 2, 3, 7, 42, 99, 123, 777, 1000, 2024, 4242, 31337, 65535, 99991,
  123456, 999999, 2 ** 31 - 1, 2 ** 32 - 1, hashString('e2e'),
  dailySeed(), dailySeed('2026-01-01'),
];

const bst = (id) => STATS.reduce((sum, s) => sum + data.creatureById[id].stats[s], 0);

// Each strategy picks one option index from a round. rng is the test's own, never the battle's.
const DRAFT_STRATEGIES = {
  first: () => 0,
  random: (options, rng) => rng.int(options.length),
  highestStats: (options) => options.reduce((best, o, i) => (bst(o.creature) > bst(options[best].creature) ? i : best), 0),
};

// Mirrors renderDraft() in app.js: the picked option object itself is pushed onto app.team,
// in round order, and that array is passed to createBattle (lead = first pick unless reordered).
function draftTeam(seed, strategy, rng) {
  const draft = generateDraft(data, seed);
  const team = [];
  for (const options of draft) team.push(options[DRAFT_STRATEGIES[strategy](options, rng)]);
  return { draft, team };
}

function bestDamageMove(state) {
  const me = activeOf(state, 'player');
  const foe = activeOf(state, 'foe');
  let best = 0, bestDmg = -1;
  me.moves.forEach((id, i) => {
    // Fixed crit/roll so this draws no numbers from the battle rng.
    const { damage } = calcDamage(state, me, foe, data.moveById[id], { crit: false, roll: 1 });
    if (damage > bestDmg) { bestDmg = damage; best = i; }
  });
  return best;
}

function playerAction(state, policy, rng) {
  const bench = living(state, 'player').filter((i) => i !== state.sides.player.active);
  if (bench.length && rng.chance(8)) return { type: 'switch', index: rng.pick(bench) };
  const index = policy === 'best' ? bestDamageMove(state) : rng.int(activeOf(state, 'player').moves.length);
  return { type: 'move', index };
}

const describe = (state, side) => {
  const f = activeOf(state, side);
  return `${f.name} (${f.hp}/${f.maxHp} HP, moves: ${f.moves.join(', ')})`;
};

function checkEvents(events, where) {
  for (const e of events) {
    assert.ok(PLAYED_EVENTS.has(e.t) || UNPLAYED_EVENTS.has(e.t), `${where}: unknown event type "${e.t}" ${JSON.stringify(e)}`);
    // JSON.stringify hides undefined and NaN, so check the values themselves.
    for (const [k, v] of Object.entries(e)) {
      assert.ok(v !== undefined && !Number.isNaN(v), `${where}: event "${e.t}" has ${k} = ${v}`);
    }
    if (e.t === 'msg') {
      assert.equal(typeof e.text, 'string', `${where}: msg without text`);
      assert.ok(!e.text.includes('undefined') && !e.text.includes('NaN'), `${where}: "${e.text}"`);
    }
    if (e.t === 'hp') assert.ok(Number.isInteger(e.hp), `${where}: hp ${e.hp}`);
  }
}

function checkHp(state, where) {
  for (const side of ['player', 'foe']) {
    for (const f of state.sides[side].team) {
      assert.ok(Number.isInteger(f.hp) && f.hp >= 0 && f.hp <= f.maxHp, `${where}: ${side} ${f.name} hp ${f.hp}/${f.maxHp}`);
    }
  }
}

// Plays one whole game. Returns the event log and the final state.
function playGame(seed, strategy, policy) {
  const rng = makeRng(hashString(`player:${seed}:${strategy}:${policy}`));
  const { team } = draftTeam(seed, strategy, rng);
  // app.js seeds the battle with hashString('battle:' + seed + ':' + Date.now()); a fixed stamp here.
  const state = createBattle(data, team, hashString('battle:' + seed + ':0'));
  const tag = `seed ${seed}, draft "${strategy}", player "${policy}"`;
  const log = [];
  checkHp(state, `${tag}, start`);
  while (state.phase !== 'over') {
    if (state.turn >= TURN_LIMIT) {
      assert.fail(`${tag}: battle stalled after ${TURN_LIMIT} turns. Player: ${describe(state, 'player')}; `
        + `foe: ${describe(state, 'foe')}; living player ${living(state, 'player').length}, foe ${living(state, 'foe').length}`);
    }
    const where = `${tag}, turn ${state.turn + 1}`;
    let events;
    if (state.phase === 'forceSwitch') {
      events = forceSwitch(state, rng.pick(living(state, 'player')));
    } else {
      // Same order as takeTurn() in app.js: the player's action, then the foe's, then the turn.
      const action = playerAction(state, policy, rng);
      events = runTurn(state, action, chooseAction(state, 'foe'), (s) => chooseSwitch(s, 'foe'));
    }
    assert.ok(events.length > 0, `${where}: no events`);
    checkEvents(events, where);
    checkHp(state, where);
    log.push(events);
  }
  assert.ok(['player', 'foe'].includes(state.winner), `${tag}: no winner`);
  const loser = state.winner === 'player' ? 'foe' : 'player';
  assert.equal(living(state, loser).length, 0, `${tag}: the losing side still has living creatures`);
  assert.equal(log.at(-1).at(-1).t, 'over', `${tag}: the last event is not "over"`);
  return { log: JSON.stringify(log), state };
}

test('the shipped data passes validation and drafts are full and deterministic', () => {
  const { rounds, optionsPerRound, movesPerCreature } = data.settings.draft;
  for (const seed of SEEDS) {
    const draft = generateDraft(data, seed);
    assert.deepEqual(generateDraft(data, seed), draft, `seed ${seed}: draft is not deterministic`);
    assert.equal(draft.length, rounds, `seed ${seed}`);
    const seen = new Set();
    for (const options of draft) {
      assert.equal(options.length, optionsPerRound, `seed ${seed}`);
      for (const o of options) {
        assert.ok(data.creatureById[o.creature], `seed ${seed}: unknown creature ${o.creature}`);
        assert.ok(!seen.has(o.creature), `seed ${seed}: ${o.creature} offered twice`);
        seen.add(o.creature);
        assert.ok(o.moves.length >= 1 && o.moves.length <= movesPerCreature, `seed ${seed}: ${o.creature} has ${o.moves.length} moves`);
        for (const id of o.moves) assert.ok(data.moveById[id], `seed ${seed}: ${o.creature} has unknown move ${id}`);
      }
    }
  }
});

test('full games on the shipped data finish with a winner, valid events and a repeatable log', () => {
  const results = { player: 0, foe: 0 };
  for (const seed of SEEDS) {
    for (const strategy of Object.keys(DRAFT_STRATEGIES)) {
      for (const policy of ['random', 'best']) {
        const first = playGame(seed, strategy, policy);
        const again = playGame(seed, strategy, policy);
        assert.equal(again.log, first.log, `seed ${seed}, draft "${strategy}", player "${policy}": replay differs`);
        results[first.state.winner]++;
      }
    }
  }
  assert.equal(results.player + results.foe, SEEDS.length * 3 * 2);
});

test('every move offered in a draft can be used for one turn without throwing', () => {
  const tried = new Set();
  for (const seed of SEEDS) {
    for (const options of generateDraft(data, seed)) {
      for (const slot of options) {
        slot.moves.forEach((id, index) => {
          const key = `${slot.creature}:${id}`;
          if (tried.has(key)) return;
          tried.add(key);
          const where = `${slot.creature} using ${id} (seed ${seed})`;
          const state = createBattle(data, [slot], hashString(key));
          let events;
          assert.doesNotThrow(() => {
            events = runTurn(state, { type: 'move', index }, chooseAction(state, 'foe'), (s) => chooseSwitch(s, 'foe'));
          }, where);
          checkEvents(events, where);
          checkHp(state, where);
        });
      }
    }
  }
  assert.ok(tried.size > 0);
});
