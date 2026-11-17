// Draft generation and team analysis.
import { makeRng, hashString } from './rng.js';
import { effectiveness, isAttack, canBeDrafted } from './data.js';

export function todayString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function dailySeed(dateString = todayString()) {
  return hashString('summit-draft:' + dateString);
}

// Picks a random move set for a creature from its move pool.
// A pool with movesPerCreature moves or fewer gives the whole pool (attack first).
export function rollMoves(data, creature, rng) {
  const { movesPerCreature, guaranteeSameTypeAttack } = data.settings.draft;
  const pool = rng.shuffle(creature.movePool);
  const attack = (id) => isAttack(data.moveById[id]);
  const chosen = [];
  // Always include one attack, and prefer one that matches the creature's own type.
  const sameType = pool.find((id) => attack(id) && creature.types.includes(data.moveById[id].type));
  const first = (guaranteeSameTypeAttack && sameType) || pool.find(attack);
  if (first) chosen.push(first);
  for (const id of pool) {
    if (chosen.length >= movesPerCreature) break;
    if (!chosen.includes(id)) chosen.push(id);
  }
  return chosen;
}

// Returns an array of rounds; each round is a list of { creature, moves } options.
// Only creatures with at least one attack in their move pool are offered.
export function generateDraft(data, seed) {
  const rng = makeRng(seed);
  const { rounds, optionsPerRound } = data.settings.draft;
  const order = rng.shuffle(data.creatures.filter((c) => canBeDrafted(c, data.moveById)));
  const out = [];
  for (let r = 0; r < rounds; r++) {
    const options = [];
    for (let o = 0; o < optionsPerRound; o++) {
      const creature = order[r * optionsPerRound + o];
      options.push({ creature: creature.id, moves: rollMoves(data, creature, rng) });
    }
    out.push(options);
  }
  return out;
}

// What a creature is weak to / resists / is immune to.
export function defensiveProfile(data, creatureTypes) {
  const weak = [], resist = [], immune = [];
  for (const t of data.types) {
    const m = effectiveness(data, t.id, creatureTypes);
    if (m === 0) immune.push(t.id);
    else if (m > 1) weak.push(t.id);
    else if (m < 1) resist.push(t.id);
  }
  return { weak, resist, immune };
}

// For each attacking type: how many team members are weak to it / resist it,
// and whether the team has an attack that hits that type hard.
export function teamCoverage(data, team) {
  return data.types.map((t) => {
    let weak = 0, resist = 0;
    for (const slot of team) {
      const m = effectiveness(data, t.id, data.creatureById[slot.creature].types);
      if (m > 1) weak++;
      else if (m < 1) resist++;
    }
    const canHit = team.some((slot) =>
      slot.moves.some((id) => {
        const mv = data.moveById[id];
        return isAttack(mv) && effectiveness(data, mv.type, [t.id]) > 1;
      })
    );
    return { type: t.id, weak, resist, canHit };
  });
}
