// Decision making for the computer-controlled side.
import { calcDamage, other, living, turnsActive } from './engine.js';
import { effectiveness, isAttack, supportedEffects } from './data.js';

function scoreMove(state, side, move) {
  const data = state.data;
  const me = state.sides[side].team[state.sides[side].active];
  const foe = state.sides[other(side)].team[state.sides[other(side)].active];
  const acc = (move.accuracy == null ? 100 : move.accuracy) / 100;
  let score = 0;
  if (isAttack(move)) {
    const { damage } = calcDamage(state, me, foe, move, { crit: false, roll: 0.92 });
    score = Math.min(damage, foe.hp) * acc;
    if (damage >= foe.hp) score += foe.maxHp * 0.5 + (move.priority > 0 ? foe.maxHp * 0.3 : 0);
  }
  for (const e of supportedEffects(move)) {
    const chance = (e.chance == null ? 100 : e.chance) / 100;
    if (e.type === 'status') {
      const immune = (data.settings.statusImmunity[e.status] || []).some((t) => foe.types.includes(t));
      if (!foe.status && !immune) score += foe.maxHp * 0.3 * chance * (move.category === 'status' ? acc : 1);
    }
    if (e.type === 'stage') {
      // Only stage changes that help this side are worth anything: raising its own stats or
      // lowering the foe's. Raising the foe's or lowering its own scores nothing.
      const helps = e.target === 'self' ? e.stages > 0 : e.stages < 0;
      if (!helps) continue;
      const target = e.target === 'self' ? me : foe;
      const current = target.stages[e.stat];
      const room = e.stages > 0 ? current < 2 : current > -2;
      const healthy = me.hp > me.maxHp * 0.6;
      if (room && healthy && move.category === 'status') score += foe.maxHp * 0.28 * chance;
    }
    if (e.type === 'heal') {
      if (me.hp < me.maxHp * 0.45) score += me.maxHp * 0.45;
    }
  }
  return score;
}

// How good a creature's matchup is against the opposing creature: its best attack's
// effectiveness, minus how hard the opponent's types hit it, plus a little for remaining HP.
export function matchupScore(data, f, foe) {
  const offence = Math.max(...f.moves.map((id) => {
    const mv = data.moveById[id];
    return isAttack(mv) ? effectiveness(data, mv.type, foe.types) : 0;
  }));
  const danger = Math.max(...foe.types.map((t) => effectiveness(data, t, f.types)));
  return offence - danger + f.hp / f.maxHp * 0.5;
}

// The champion's voluntary switch: returns the bench index to switch to, or -1 to stay in.
// The random roll is drawn only when every other condition holds, so battles where switching
// is never considered keep exactly the same random numbers.
function chooseVoluntarySwitch(state, side) {
  const data = state.data;
  const ai = data.settings.ai;
  if (!(ai.switchEagerness > 0)) return -1;
  const me = state.sides[side].team[state.sides[side].active];
  const foe = state.sides[other(side)].team[state.sides[other(side)].active];
  if (me.hp <= 0 || foe.hp <= 0) return -1;
  const weak = foe.types.some((t) => effectiveness(data, t, me.types) > 1);
  if (!weak) return -1;
  const canHitHard = me.moves.some((id) => {
    const mv = data.moveById[id];
    return isAttack(mv) && effectiveness(data, mv.type, foe.types) > 1;
  });
  if (canHitHard) return -1;
  if (turnsActive(state, side) < ai.switchCooldownTurns) return -1;
  let best = -1, bestScore = -Infinity;
  for (const i of living(state, side)) {
    if (i === state.sides[side].active) continue;
    const score = matchupScore(data, state.sides[side].team[i], foe);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  // The bench creature must be strictly better, and by at least the margin, so a margin of 0
  // never swaps one creature for an equally placed one.
  const current = matchupScore(data, me, foe);
  if (best < 0 || bestScore <= current || bestScore < current + ai.switchMinMargin) return -1;
  return state.rng.next() < ai.switchEagerness / 100 ? best : -1;
}

export function chooseAction(state, side = 'foe') {
  if (side === 'foe') {
    const index = chooseVoluntarySwitch(state, side);
    if (index >= 0) return { type: 'switch', index };
  }
  const me = state.sides[side].team[state.sides[side].active];
  let best = 0, bestScore = -1;
  me.moves.forEach((id, i) => {
    const s = scoreMove(state, side, state.data.moveById[id]) * (0.9 + state.rng.next() * 0.2);
    if (s > bestScore) { bestScore = s; best = i; }
  });
  return { type: 'move', index: best };
}

// Picks the living team member with the best matchup against the opposing active creature.
export function chooseSwitch(state, side = 'foe') {
  const foe = state.sides[other(side)].team[state.sides[other(side)].active];
  let best = -1, bestScore = -Infinity;
  for (const i of living(state, side)) {
    const score = matchupScore(state.data, state.sides[side].team[i], foe);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}
