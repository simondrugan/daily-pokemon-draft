import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTestData, loadFixtureData } from './helpers.js';
import { createBattle, runTurn, forceSwitch, calcDamage, living, activeOf, stageMult } from '../public/js/engine.js';
import { chooseAction, chooseSwitch } from '../public/js/ai.js';
import { generateDraft } from '../public/js/draft.js';
import { makeRng } from '../public/js/rng.js';

const data = loadFixtureData();
const team = (d, seed) => generateDraft(d, seed).map((round) => round[0]);

// The fixture data with a different champion team, for testing one move at a time.
const withChampion = (teamSlots) => ({ ...data, champion: { ...data.champion, team: teamSlots } });
const idle = withChampion([{ creature: 'copyclay', moves: ['mimic-dance'] }]);
const msgs = (events) => events.filter((e) => e.t === 'msg').map((e) => e.text);
const snapshot = (f) => JSON.stringify({ hp: f.hp, stages: f.stages, status: f.status });

test('super-effective hits do double damage and same-type attacks get a bonus', () => {
  const state = createBattle(data, [{ creature: 'puddlefin', moves: ['tide-pulse', 'volt-pulse'] }], 1);
  const me = activeOf(state, 'player');
  const fire = { ...me, types: ['fire'] };
  const neutral = { ...me, types: ['normal'] };
  const opts = { crit: false, roll: 1 };
  const strong = calcDamage(state, me, fire, data.moveById['tide-pulse'], opts).damage;
  const plain = calcDamage(state, me, neutral, data.moveById['tide-pulse'], opts).damage;
  assert.ok(Math.abs(strong - plain * 2) <= 2);
  const offType = calcDamage(state, me, neutral, data.moveById['volt-pulse'], opts).damage;
  assert.ok(plain > offType, 'same-type bonus applies');
  assert.equal(calcDamage(state, me, { ...me, types: ['ghost'] }, data.moveById['bonk'], opts).damage, 0);
});

test('stat stages scale symmetrically', () => {
  assert.equal(stageMult(2), 2);
  assert.equal(stageMult(-2), 0.5);
  assert.equal(stageMult(0), 1);
});

test('a status move with only unsupported effects (or none) says "But nothing happened!" and changes nothing', () => {
  for (const moveId of ['fog-veil', 'mimic-dance']) {
    const state = createBattle(idle, [{ creature: 'wispling', moves: [moveId] }], 7);
    const before = [snapshot(activeOf(state, 'player')), snapshot(activeOf(state, 'foe'))];
    const events = runTurn(state, { type: 'move', index: 0 }, { type: 'move', index: 0 });
    const text = msgs(events);
    const used = text.indexOf(`Your Wispling used ${state.data.moveById[moveId].name}!`);
    assert.ok(used >= 0);
    assert.equal(text[used + 1], 'But nothing happened!');
    assert.ok(text.includes("The foe's Copyclay used Mimic Dance!"));
    assert.deepEqual([snapshot(activeOf(state, 'player')), snapshot(activeOf(state, 'foe'))], before);
    assert.ok(!events.some((e) => ['hp', 'stages', 'status'].includes(e.t)));
    assert.ok(!text.some((t) => t.includes('undefined')));
    // The only random numbers drawn were the two speed-tie rolls.
    const rng = makeRng(7);
    rng.next();
    rng.next();
    assert.equal(state.rng.next(), rng.next());
  }
});

test('an attack with no power deals no damage and still runs its effects; with none it says "But nothing happened!"', () => {
  const state = createBattle(idle, [{ creature: 'sproutle', moves: ['hurl-gamble', 'echo-back'] }], 3);
  const me = activeOf(state, 'player');
  const foe = activeOf(state, 'foe');
  for (const id of ['hurl-gamble', 'echo-back']) {
    for (const opts of [{}, { crit: false, roll: 1 }]) {
      const r = calcDamage(state, me, foe, data.moveById[id], opts);
      assert.equal(r.damage, 0);
      assert.ok(!Number.isNaN(r.damage));
    }
  }
  let events = runTurn(state, { type: 'move', index: 0 }, { type: 'move', index: 0 });
  assert.equal(foe.hp, foe.maxHp);
  assert.equal(me.stages.spe, 1, 'the supported stage effect still runs');
  assert.ok(!events.some((e) => e.t === 'hp'));
  let text = msgs(events);
  assert.equal(text[text.indexOf('Your Sproutle used Hurl Gamble!') + 1], "Your Sproutle's Speed rose!");

  events = runTurn(state, { type: 'move', index: 1 }, { type: 'move', index: 0 });
  text = msgs(events);
  const used = text.indexOf('Your Sproutle used Echo Back!');
  assert.ok(used >= 0);
  assert.equal(text[used + 1], 'But nothing happened!', text.join(' / '));
  assert.equal(foe.hp, foe.maxHp);
  assert.ok(!events.some((e) => e.t === 'hp' || Number.isNaN(e.hp)));
});

test('"But nothing happened!" comes after the accuracy roll, so it draws the same random numbers', () => {
  const state = createBattle(idle, [{ creature: 'sproutle', moves: ['echo-back'] }], 21);
  runTurn(state, { type: 'move', index: 0 }, { type: 'move', index: 0 });
  // Two speed-tie rolls, then Echo Back's accuracy roll. Mimic Dance never misses, so draws nothing.
  const rng = makeRng(21);
  for (let i = 0; i < 3; i++) rng.next();
  assert.equal(state.rng.next(), rng.next());

  // A miss still says "It missed!" rather than "But nothing happened!".
  const shaky = { ...data.moveById['echo-back'], id: 'echo-shaky', accuracy: 1 };
  const d = { ...idle, moveById: { ...idle.moveById, 'echo-shaky': shaky } };
  const s2 = createBattle(d, [{ creature: 'sproutle', moves: ['echo-shaky'] }], 21);
  const text = msgs(runTurn(s2, { type: 'move', index: 0 }, { type: 'move', index: 0 }));
  assert.equal(text[text.indexOf('Your Sproutle used Echo Back!') + 1], 'It missed!');
});

test('an attack with no power against an immune type does not affect it and skips its effects', () => {
  // Normal moves do not affect ghost types.
  const ghostIdle = withChampion([{ creature: 'wispling', moves: ['mimic-dance'] }]);
  for (const id of ['hurl-gamble', 'echo-back']) {
    const state = createBattle(ghostIdle, [{ creature: 'sproutle', moves: [id] }], 5);
    const me = activeOf(state, 'player');
    const events = runTurn(state, { type: 'move', index: 0 }, { type: 'move', index: 0 });
    const text = msgs(events);
    const used = text.indexOf(`Your Sproutle used ${data.moveById[id].name}!`);
    assert.equal(text[used + 1], "It doesn't affect Wispling...", text.join(' / '));
    assert.equal(me.stages.spe, 0, 'effects are skipped');
    // Same random numbers as before: two speed-tie rolls and one accuracy roll.
    const rng = makeRng(5);
    for (let i = 0; i < 3; i++) rng.next();
    assert.equal(state.rng.next(), rng.next());
  }
});

test('high critical-hit chance works as an effect exactly like the move-level flag', () => {
  const b = data.settings.battle;
  const wail = data.moveById['wail']; // written as {"type": "highCrit"}
  const flag = { ...wail, effects: [], highCrit: true };
  const plain = { ...wail, effects: [] };
  let highCrits = 0;
  for (let seed = 0; seed < 400; seed++) {
    const run = (move) => {
      const state = createBattle(data, [{ creature: 'wispling', moves: ['wail'] }], seed);
      const r = calcDamage(state, activeOf(state, 'player'), activeOf(state, 'foe'), move);
      return { ...r, next: state.rng.next() };
    };
    const a = run(wail);
    assert.deepEqual(a, run(flag), `seed ${seed}`);
    // The first draw is the crit roll, at the high percent; the same number of draws as a plain attack.
    const rng = makeRng(seed);
    assert.equal(a.crit, rng.next() * 100 < b.highCritChancePercent);
    rng.next();
    assert.equal(a.next, rng.next());
    assert.equal(run(plain).next, a.next);
    if (a.crit) highCrits++;
  }
  assert.ok(highCrits > 400 * (b.critChancePercent + 4) / 100, `${highCrits} crits`);
});

test('the AI values stage changes only when they help it', async () => {
  const pick = (moves, seed) => {
    const d = withChampion([{ creature: 'duoduck', moves }]);
    const state = createBattle(d, [{ creature: 'sproutle', moves: ['bonk'] }], seed);
    return chooseAction(state).index;
  };
  for (let seed = 0; seed < 50; seed++) {
    // Goad raises the foe's Attack: worth no more than a move that does nothing.
    assert.equal(pick(['mimic-dance', 'goad'], seed), 0, `seed ${seed}: chose Goad`);
    // Scowl lowers the foe's Attack and Deep Focus raises its own Sp. Attack: both are worth using.
    assert.equal(pick(['mimic-dance', 'scowl'], seed), 1, `seed ${seed}: skipped Scowl`);
    assert.equal(pick(['mimic-dance', 'deep-focus'], seed), 1, `seed ${seed}: skipped Deep Focus`);
  }
  const selfDrop = { id: 'slump', name: 'Slump', type: 'normal', category: 'status', power: 0, accuracy: null,
    effects: [{ type: 'stage', target: 'self', stat: 'def', stages: -1 }] };
  const d = withChampion([{ creature: 'duoduck', moves: ['mimic-dance', 'slump'] }]);
  const dd = { ...d, moveById: { ...d.moveById, slump: selfDrop } };
  const state = createBattle(dd, [{ creature: 'sproutle', moves: ['bonk'] }], 1);
  assert.equal(chooseAction(state).index, 0, 'lowering its own stat is worth nothing');
});

test('unsupported effects on an attack are skipped without drawing random numbers', () => {
  // rime-spray has a 10% "freeze" (not supported yet); a copy with no effects must play out identically.
  const plain = { ...data.moveById['rime-spray'], id: 'rime-plain', effects: [] };
  const variant = { ...idle, moveById: { ...idle.moveById, 'rime-plain': plain } };
  const play = (d, moveId) => {
    const state = createBattle(d, [{ creature: 'puddlefin', moves: [moveId] }], 11);
    const log = [];
    for (let i = 0; i < 4 && state.phase === 'choose'; i++) log.push(runTurn(state, { type: 'move', index: 0 }, { type: 'move', index: 0 }));
    return { log: JSON.stringify(log), next: state.rng.next(), foe: activeOf(state, 'foe') };
  };
  const a = play(idle, 'rime-spray');
  const b = play(variant, 'rime-plain');
  assert.equal(a.log, b.log);
  assert.equal(a.next, b.next);
  assert.equal(a.foe.status, null);
});

test('the champion keeps its fixed moves, even a creature with no attack', () => {
  const state = createBattle(data, team(data, 1), 1);
  data.champion.team.forEach((slot, i) => assert.deepEqual(state.sides.foe.team[i].moves, slot.moves));
});

test('battles are deterministic for a given seed and actions', () => {
  for (const d of [data, loadTestData()]) {
    const run = () => {
      const s = createBattle(d, team(d, 5), 99);
      const log = [];
      for (let i = 0; i < 8 && s.phase === 'choose'; i++) {
        log.push(runTurn(s, { type: 'move', index: i % activeOf(s, 'player').moves.length }, chooseAction(s), chooseSwitch));
      }
      return JSON.stringify(log);
    };
    assert.equal(run(), run());
  }
});

function playRandomBattles(d, count) {
  for (let seed = 0; seed < count; seed++) {
    const rng = makeRng(seed + 1000);
    const state = createBattle(d, team(d, seed), seed);
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
      for (const e of events) {
        if (e.t === 'msg') assert.ok(!e.text.includes('undefined') && !e.text.includes('NaN'), e.text);
        if (e.t === 'hp') assert.ok(Number.isInteger(e.hp), `battle ${seed}: hp ${e.hp}`);
      }
      for (const side of ['player', 'foe']) {
        for (const f of state.sides[side].team) assert.ok(f.hp >= 0 && f.hp <= f.maxHp);
      }
    }
    assert.ok(['player', 'foe'].includes(state.winner));
    assert.equal(living(state, state.winner === 'player' ? 'foe' : 'player').length, 0);
  }
}

test('random battles always finish with a winner and consistent state', () => {
  playRandomBattles(data, 300);
});

test('random battles on the shipped data finish without errors', () => {
  playRandomBattles(loadTestData(), 100);
});

test('a switch cannot target a fainted creature or the active one', () => {
  const state = createBattle(data, team(data, 1), 1);
  assert.throws(() => runTurn(state, { type: 'switch', index: 0 }, { type: 'move', index: 0 }));
});
