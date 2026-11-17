import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTestData, loadFixtureData, readFixtureRaw } from './helpers.js';
import { createBattle, runTurn, forceSwitch, activeOf, living, turnsActive } from '../public/js/engine.js';
import { chooseAction, chooseSwitch, matchupScore } from '../public/js/ai.js';
import { validate } from '../public/js/data.js';
import { generateDraft } from '../public/js/draft.js';
import { makeRng } from '../public/js/rng.js';

const data = loadFixtureData();

// Fixture data with a different champion team and AI settings.
// statMultiplier is low so the champion's attacks do not knock out the test creatures.
const setup = (teamSlots, ai = {}) => ({
  ...data,
  champion: { ...data.champion, statMultiplier: 0.5, team: teamSlots },
  settings: { ...data.settings, ai: { ...data.settings.ai, ...ai } },
});
const eager = { switchEagerness: 100, switchMinMargin: 1, switchCooldownTurns: 0 };

// Emberkit (fire) only has fire attacks, which are weak against water and it is weak to water.
const ember = { creature: 'emberkit', moves: ['cinder-flick', 'kiln-blast'] };
const sprout = { creature: 'sproutle', moves: ['sap-bite'] };
const puddle = { creature: 'puddlefin', moves: ['tide-pulse'] };
const copy = { creature: 'copyclay', moves: ['mimic-dance'] };
const playerPuddle = { creature: 'puddlefin', moves: ['mimic-dance'] };
const playerEmber = { creature: 'emberkit', moves: ['mimic-dance'] };
const rest = { type: 'move', index: 0 };

// The random numbers the plain move choice draws: one per move.
const drawsAfter = (seed, n) => {
  const rng = makeRng(seed);
  for (let i = 0; i < n; i++) rng.next();
  return rng.next();
};

test('the matchup score is shared by the voluntary switch and the faint replacement', () => {
  const state = createBattle(setup([ember, sprout]), [playerPuddle], 1);
  const foe = activeOf(state, 'player');
  // Emberkit: best attack 0.5, takes 2 from water, full HP.
  assert.equal(matchupScore(data, state.sides.foe.team[0], foe), 0.5 - 2 + 0.5);
  // Sproutle: best attack 2, takes 0.5 from water, full HP.
  assert.equal(matchupScore(data, state.sides.foe.team[1], foe), 2 - 0.5 + 0.5);
  assert.equal(chooseSwitch(state, 'foe'), 1);
});

test('the champion switches out of a bad matchup to a clearly better creature', () => {
  const state = createBattle(setup([ember, copy, sprout], eager), [playerPuddle], 3);
  const action = chooseAction(state, 'foe');
  assert.deepEqual(action, { type: 'switch', index: 2 });
  const events = runTurn(state, rest, action, chooseSwitch);
  assert.ok(events.some((e) => e.t === 'switch' && e.side === 'foe' && e.idx === 2));
  assert.ok(events.some((e) => e.t === 'msg' && e.text === 'Champion Test sent out Sproutle!'));
  assert.equal(activeOf(state, 'foe').id, 'sproutle');
  assert.ok(!events.some((e) => e.t === 'msg' && e.text.startsWith("The foe's")), 'the switch uses up its turn');
});

test('the champion stays in when it has a super-effective attack', () => {
  const zappy = { creature: 'emberkit', moves: ['cinder-flick', 'volt-pulse'] };
  for (let seed = 0; seed < 30; seed++) {
    const state = createBattle(setup([zappy, sprout], eager), [playerPuddle], seed);
    assert.equal(chooseAction(state, 'foe').type, 'move', `seed ${seed}`);
    assert.equal(state.rng.next(), drawsAfter(seed, 2), 'no extra random number drawn');
  }
});

test('the champion stays in when it is not weak to the player\'s creature', () => {
  // Emberkit against Sproutle: not weak, so it never considers switching.
  const state = createBattle(setup([ember, puddle], eager), [{ creature: 'sproutle', moves: ['mimic-dance'] }], 4);
  assert.equal(chooseAction(state, 'foe').type, 'move');
});

test('the champion stays in when no benched creature is clearly better', () => {
  // Copyclay scores -0.5 against water, Emberkit -1: better, but not by the margin of 1.
  for (let seed = 0; seed < 30; seed++) {
    const state = createBattle(setup([ember, copy], eager), [playerPuddle], seed);
    assert.equal(chooseAction(state, 'foe').type, 'move', `seed ${seed}`);
    assert.equal(state.rng.next(), drawsAfter(seed, 2), 'no extra random number drawn');
  }
  // With no margin required, the same bench is good enough.
  const state = createBattle(setup([ember, copy], { ...eager, switchMinMargin: 0 }), [playerPuddle], 1);
  assert.deepEqual(chooseAction(state, 'foe'), { type: 'switch', index: 1 });
});

test('the champion never switches with eagerness 0, and draws the same random numbers as before', () => {
  for (let seed = 0; seed < 30; seed++) {
    const state = createBattle(setup([ember, sprout], { ...eager, switchEagerness: 0 }), [playerPuddle], seed);
    assert.equal(chooseAction(state, 'foe').type, 'move');
    assert.equal(state.rng.next(), drawsAfter(seed, 2));
  }
});

test('the champion never switches when its active creature is the only one left', () => {
  const state = createBattle(setup([ember, sprout], eager), [playerPuddle], 2);
  state.sides.foe.team[1].hp = 0;
  assert.equal(chooseAction(state, 'foe').type, 'move');
  assert.equal(state.rng.next(), drawsAfter(2, 2));
});

test('switchEagerness is the chance of switching when a switch is worthwhile', () => {
  let switched = 0;
  for (let seed = 0; seed < 300; seed++) {
    const state = createBattle(setup([ember, sprout], { ...eager, switchEagerness: 60 }), [playerPuddle], seed);
    const action = chooseAction(state, 'foe');
    // The first random number of the battle is the eagerness roll.
    assert.equal(action.type === 'switch', makeRng(seed).next() < 0.6, `seed ${seed}`);
    if (action.type === 'switch') switched++;
    else assert.equal(state.rng.next(), drawsAfter(seed, 3), 'the roll, then the usual move rolls');
  }
  assert.ok(switched > 140 && switched < 220, `${switched} of 300`);
});

test('the player side never switches voluntarily', () => {
  // The player's Emberkit is in the same bad matchup against the champion's Puddlefin.
  for (let seed = 0; seed < 30; seed++) {
    const state = createBattle(setup([puddle], eager), [ember, sprout], seed);
    assert.equal(chooseAction(state, 'player').type, 'move');
    assert.equal(state.rng.next(), drawsAfter(seed, 2));
  }
});

test('a creature must stay in for switchCooldownTurns turns, so the champion does not switch back and forth', () => {
  const d = setup([ember, sprout, puddle], { ...eager, switchCooldownTurns: 2 });
  const state = createBattle(d, [playerPuddle, playerEmber], 8);
  const plan = [rest, rest, rest, { type: 'switch', index: 1 }, rest, rest, rest, rest];
  const foeActions = [];
  for (const playerAction of plan) {
    const foeAction = chooseAction(state, 'foe');
    foeActions.push(foeAction.type === 'switch' ? `switch ${foeAction.index}` : 'move');
    runTurn(state, playerAction, foeAction, chooseSwitch);
    assert.equal(state.phase, 'choose');
  }
  // Turns 1-2: the lead has not been in for 2 turns yet. Turn 3: out to Sproutle.
  // Turn 4: the player brings in Emberkit, which Sproutle is weak to, but Sproutle only
  // came in last turn. Turn 6: Sproutle has been in for 2 turns, so out to Puddlefin.
  assert.deepEqual(foeActions, ['move', 'move', 'switch 1', 'move', 'move', 'switch 2', 'move', 'move']);
  assert.equal(state.sides.foe.activeSince, 6);
  assert.equal(turnsActive(state, 'foe'), 2);
});

test('the turn a creature came in is tracked for faint replacements and player switches too', () => {
  const state = createBattle(setup([ember, sprout], eager), [playerPuddle, playerEmber], 1);
  assert.equal(turnsActive(state, 'player'), 0);
  runTurn(state, rest, rest, chooseSwitch);
  runTurn(state, { type: 'switch', index: 1 }, rest, chooseSwitch);
  assert.equal(state.sides.player.activeSince, 2);
  state.sides.foe.team[0].hp = 1;
  state.sides.foe.team[0].status = 'poison';
  runTurn(state, rest, rest, chooseSwitch);
  assert.equal(activeOf(state, 'foe').id, 'sproutle');
  assert.equal(state.sides.foe.activeSince, 3);
});

function playFull(d, seed) {
  const team = generateDraft(d, seed).map((round) => round[0]);
  const state = createBattle(d, team, seed);
  const log = [];
  const foeSwitchTurns = [];
  let guard = 0;
  while (state.phase !== 'over') {
    assert.ok(++guard < 2000, `battle ${seed} did not finish`);
    if (state.phase === 'forceSwitch') {
      log.push(forceSwitch(state, chooseSwitch(state, 'player')));
      continue;
    }
    const foeAction = chooseAction(state, 'foe');
    if (foeAction.type === 'switch') {
      assert.ok(turnsActive(state, 'foe') >= d.settings.ai.switchCooldownTurns);
      foeSwitchTurns.push(state.turn + 1);
    }
    log.push(runTurn(state, chooseAction(state, 'player'), foeAction, chooseSwitch));
  }
  return { log: JSON.stringify(log), foeSwitchTurns };
}

test('battles with champion switches are deterministic and never switch on consecutive turns', () => {
  for (const d of [data, loadTestData()]) {
    let total = 0;
    for (let seed = 0; seed < 150; seed++) {
      const a = playFull(d, seed);
      assert.equal(a.log, playFull(d, seed).log, `seed ${seed}`);
      for (let i = 1; i < a.foeSwitchTurns.length; i++) {
        assert.ok(a.foeSwitchTurns[i] - a.foeSwitchTurns[i - 1] > 1, `seed ${seed}: switched on turns ${a.foeSwitchTurns}`);
      }
      total += a.foeSwitchTurns.length;
    }
    assert.ok(total > 0, 'the champion switched at least once');
  }
});

// --- Validation of the "ai" section ---

const aiErrors = (change) => {
  const raw = readFixtureRaw();
  change(raw.settings);
  return validate(raw);
};

test('the ai section is required', () => {
  const errors = aiErrors((s) => delete s.ai);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /settings\.json: the "ai" section is missing/);
});

test('each ai field is required', () => {
  for (const field of ['switchEagerness', 'switchMinMargin', 'switchCooldownTurns']) {
    const errors = aiErrors((s) => delete s.ai[field]);
    assert.deepEqual(errors.length, 1, field);
    assert.match(errors[0], new RegExp(`ai\\.${field} is missing`));
  }
});

test('ai fields with the wrong value are reported in plain language', () => {
  const bad = [
    ['switchEagerness', 101, /percent from 0 to 100/],
    ['switchEagerness', -1, /percent from 0 to 100/],
    ['switchEagerness', '60', /percent from 0 to 100/],
    ['switchMinMargin', -0.5, /number of 0 or more/],
    ['switchMinMargin', 'big', /number of 0 or more/],
    ['switchMinMargin', null, /number of 0 or more/],
    ['switchCooldownTurns', -1, /whole number of turns/],
    ['switchCooldownTurns', 1.5, /whole number of turns/],
    ['switchCooldownTurns', '2', /whole number of turns/],
  ];
  for (const [field, value, pattern] of bad) {
    const errors = aiErrors((s) => (s.ai[field] = value));
    assert.equal(errors.length, 1, `${field} = ${JSON.stringify(value)}`);
    assert.ok(errors[0].startsWith(`settings.json: ai.${field} is ${JSON.stringify(value)}, but it must be`), errors[0]);
    assert.match(errors[0], pattern);
  }
  // The edges of each range are fine.
  for (const [field, value] of [['switchEagerness', 0], ['switchEagerness', 100], ['switchMinMargin', 0], ['switchMinMargin', 0.5], ['switchCooldownTurns', 0]]) {
    assert.deepEqual(aiErrors((s) => (s.ai[field] = value)), [], `${field} = ${value}`);
  }
});
