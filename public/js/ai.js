// Decision making for the computer-controlled side.
import { calcDamage, other, living } from './engine.js';
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

export function chooseAction(state, side = 'foe') {
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
  const data = state.data;
  const foe = state.sides[other(side)].team[state.sides[other(side)].active];
  let best = -1, bestScore = -Infinity;
  for (const i of living(state, side)) {
    const f = state.sides[side].team[i];
    const offence = Math.max(...f.moves.map((id) => {
      const mv = data.moveById[id];
      return isAttack(mv) ? effectiveness(data, mv.type, foe.types) : 0;
    }));
    const danger = Math.max(...foe.types.map((t) => effectiveness(data, t, f.types)));
    const score = offence - danger + f.hp / f.maxHp * 0.5;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}
