// Not a test: prints how often different play styles beat the champion.
// Run with `npm run balance` after changing data files to see the effect.
import { loadTestData } from './helpers.js';
import { createBattle, runTurn, forceSwitch, living } from '../public/js/engine.js';
import { chooseAction, chooseSwitch } from '../public/js/ai.js';
import { generateDraft, teamCoverage } from '../public/js/draft.js';
import { makeRng } from '../public/js/rng.js';

const data = loadTestData();
const N = 1000;

function play(team, seed) {
  const state = createBattle(data, team, seed);
  while (state.phase !== 'over') {
    if (state.phase === 'forceSwitch') forceSwitch(state, chooseSwitch(state, 'player'));
    else runTurn(state, chooseAction(state, 'player'), chooseAction(state, 'foe'), chooseSwitch);
  }
  return state.winner === 'player';
}

const drafters = {
  'random picks': (round, _team, rng) => rng.pick(round),
  'highest stat total': (round) =>
    round.slice().sort((a, b) => total(b) - total(a))[0],
  'fewest shared weaknesses': (round, team) =>
    round.slice().sort((a, b) => badness([...team, a]) - badness([...team, b]) || total(b) - total(a))[0],
};
const total = (o) => Object.values(data.creatureById[o.creature].stats).reduce((x, y) => x + y, 0);
const badness = (team) => teamCoverage(data, team).reduce((s, c) => s + Math.max(0, c.weak - c.resist) ** 2 + (c.canHit ? 0 : 1), 0);

for (const [name, pickFn] of Object.entries(drafters)) {
  let wins = 0;
  for (let seed = 0; seed < N; seed++) {
    const rng = makeRng(seed);
    const team = [];
    for (const round of generateDraft(data, seed)) team.push(pickFn(round, team, rng));
    if (play(team, seed)) wins++;
  }
  console.log(`${name.padEnd(26)} ${(wins / N * 100).toFixed(1)}% wins (computer piloting both sides)`);
}
