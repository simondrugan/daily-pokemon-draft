// Loads the JSON config files and checks them for mistakes.
// Everything about types, moves, creatures and the champion lives in /data.

export const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
export const STAGE_STATS = ['atk', 'def', 'spa', 'spd', 'spe'];
export const STATUSES = ['burn', 'poison', 'paralysis', 'sleep'];
export const CATEGORIES = ['physical', 'special', 'status'];
const EFFECT_TYPES = ['status', 'stage', 'recoil', 'drain', 'heal', 'flinch', 'highCrit'];

// NOT YET SUPPORTED IN BATTLE.
// The move list uses these names, but the battle engine does not run them yet. The checker
// accepts them so the game loads; in battle they are skipped (no effect, no random roll), and
// a status move made only of them says "But nothing happened!".
// They are being added in follow-up tickets #9 to #14. When a mechanic is implemented, move its
// name out of this list and into EFFECT_TYPES / STATUSES / STAGE_STATS above.
// Any name that is in neither list is still reported as a mistake.
// "highCrit" is supported: as an effect ({"type": "highCrit"}) or as the move-level flag
// ("highCrit": true) it raises the critical-hit chance. "alwaysCrit" is not supported yet.
export const UNSUPPORTED = {
  effects: [
    'ohko', 'trap', 'twoTurn', 'recharge', 'weather', 'terrain', 'multiHit',
    'confuse', 'switchOut', 'protect', 'selfFaint', 'hazard', 'screen', 'forceSwitch', 'alwaysCrit',
  ],
  statuses: ['freeze', 'badly-poisoned', 'random'],
  stats: ['accuracy', 'evasion'],
};

// True when the battle engine knows how to run this effect today.
export function isSupportedEffect(e) {
  if (!EFFECT_TYPES.includes(e.type)) return false;
  if (e.type === 'status') return STATUSES.includes(e.status);
  if (e.type === 'stage') return STAGE_STATS.includes(e.stat);
  return true;
}

// True when a move has a higher critical-hit chance, written either as the move-level flag
// "highCrit": true or as the effect {"type": "highCrit"}.
export const hasHighCrit = (move) =>
  !!move && (move.highCrit === true || (move.effects || []).some((e) => e.type === 'highCrit'));

// The effects of a move that the battle engine runs (unsupported ones are left out).
export const supportedEffects = (move) => (move.effects || []).filter(isSupportedEffect);

// True when a move deals damage: it is physical or special and has power above 0.
// Attacks with "power": null (or 0) are allowed but deal no damage.
export const isAttack = (move) => !!move && move.category !== 'status' && move.power > 0;

// A creature can be offered in the draft only if its move pool has at least one attack.
export const canBeDrafted = (creature, moveById) =>
  (creature.movePool || []).some((id) => isAttack(moveById[id]));

export const FILES = ['types', 'moves', 'creatures', 'champion', 'settings'];

export async function loadData(base = 'data/') {
  const raw = {};
  await Promise.all(
    FILES.map(async (name) => {
      const res = await fetch(`${base}${name}.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`Could not load ${name}.json (${res.status})`);
      try {
        raw[name] = await res.json();
      } catch (e) {
        throw new Error(`${name}.json is not valid JSON: ${e.message}`);
      }
    })
  );
  return buildData(raw);
}

// Turns the raw files into one object with lookup maps. Throws if the config has errors.
export function buildData(raw) {
  const errors = validate(raw);
  if (errors.length) {
    const err = new Error('Config errors:\n- ' + errors.join('\n- '));
    err.configErrors = errors;
    throw err;
  }
  const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  return {
    types: raw.types.types,
    typeById: byId(raw.types.types),
    chart: raw.types.chart,
    moves: raw.moves.moves,
    moveById: byId(raw.moves.moves),
    creatures: raw.creatures.creatures,
    creatureById: byId(raw.creatures.creatures),
    champion: raw.champion,
    settings: raw.settings,
  };
}

export function validate(raw) {
  const errors = [];
  for (const f of FILES) if (!raw[f]) errors.push(`${f}.json is missing`);
  if (errors.length) return errors;

  const types = raw.types.types || [];
  const chart = raw.types.chart || {};
  const moves = raw.moves.moves || [];
  const creatures = raw.creatures.creatures || [];
  const typeIds = new Set(types.map((t) => t.id));
  const moveIds = new Set(moves.map((m) => m.id));
  const creatureIds = new Set(creatures.map((c) => c.id));
  const moveMap = Object.fromEntries(moves.map((m) => [m.id, m]));

  const dupes = (list, label) => {
    const seen = new Set();
    for (const x of list) {
      if (!x.id) errors.push(`${label}: an entry has no id`);
      if (seen.has(x.id)) errors.push(`${label}: duplicate id "${x.id}"`);
      seen.add(x.id);
    }
  };
  dupes(types, 'types.json');
  dupes(moves, 'moves.json');
  dupes(creatures, 'creatures.json');

  for (const t of types) {
    if (!t.name) errors.push(`types.json: type "${t.id}" has no name`);
    const row = chart[t.id];
    if (!row) {
      errors.push(`types.json: chart has no row for "${t.id}"`);
      continue;
    }
    const seen = new Set();
    for (const key of ['strong', 'weak', 'none']) {
      for (const d of row[key] || []) {
        if (!typeIds.has(d)) errors.push(`types.json: chart.${t.id}.${key} lists unknown type "${d}"`);
        if (seen.has(d)) errors.push(`types.json: chart.${t.id} lists "${d}" more than once`);
        seen.add(d);
      }
    }
  }
  for (const id of Object.keys(chart)) {
    if (!typeIds.has(id)) errors.push(`types.json: chart has a row for unknown type "${id}"`);
  }

  for (const m of moves) {
    const at = `moves.json: move "${m.id}"`;
    if (!m.name) errors.push(`${at} has no name`);
    if (!typeIds.has(m.type)) errors.push(`${at} has unknown type "${m.type}"`);
    if (!CATEGORIES.includes(m.category)) errors.push(`${at} has unknown category "${m.category}"`);
    if (['physical', 'special'].includes(m.category) && !('power' in m)) errors.push(`${at} is an attack but has no "power" (use null if its damage works differently)`);
    if (m.power != null && !(typeof m.power === 'number' && m.power >= 0)) errors.push(`${at} power must be a number of 0 or more, or null for no damage`);
    if (m.accuracy != null && !(m.accuracy > 0 && m.accuracy <= 100)) errors.push(`${at} accuracy must be 1-100 or null`);
    for (const e of m.effects || []) {
      if (!EFFECT_TYPES.includes(e.type) && !UNSUPPORTED.effects.includes(e.type)) errors.push(`${at} has unknown effect type "${e.type}"`);
      if (e.type === 'status' && !STATUSES.includes(e.status) && !UNSUPPORTED.statuses.includes(e.status)) errors.push(`${at} has unknown status "${e.status}"`);
      if (e.type === 'stage') {
        if (!STAGE_STATS.includes(e.stat) && !UNSUPPORTED.stats.includes(e.stat)) errors.push(`${at} has unknown stat "${e.stat}"`);
        if (!['self', 'foe'].includes(e.target)) errors.push(`${at} stage effect needs target "self" or "foe"`);
        if (!Number.isInteger(e.stages) || e.stages === 0) errors.push(`${at} stage effect needs a non-zero whole number of stages`);
      }
      if (['recoil', 'drain', 'heal'].includes(e.type) && !(e.percent > 0)) errors.push(`${at} ${e.type} effect needs a percent`);
    }
  }

  const draft = raw.settings.draft || {};
  for (const c of creatures) {
    const at = `creatures.json: creature "${c.id}"`;
    if (!c.name) errors.push(`${at} has no name`);
    if (!Array.isArray(c.types) || c.types.length < 1 || c.types.length > 2) errors.push(`${at} needs 1 or 2 types`);
    for (const t of c.types || []) if (!typeIds.has(t)) errors.push(`${at} has unknown type "${t}"`);
    for (const s of STATS) if (!(c.stats && c.stats[s] > 0)) errors.push(`${at} is missing stat "${s}"`);
    if (c.icon != null && (typeof c.icon !== 'string' || !c.icon)) errors.push(`${at} icon must be a file path such as "icons/${c.id}.png"`);
    const pool = c.movePool || [];
    for (const m of pool) if (!moveIds.has(m)) errors.push(`${at} movePool lists unknown move "${m}"`);
    if (new Set(pool).size !== pool.length) errors.push(`${at} movePool lists a move twice`);
    if (!Array.isArray(c.movePool) || pool.length < 1) errors.push(`${at} movePool needs at least 1 move`);
  }
  // Creatures with no attack are allowed, but they are left out of the draft.
  const draftable = creatures.filter((c) => canBeDrafted(c, moveMap)).length;

  if (!(draft.rounds > 0 && draft.optionsPerRound > 0 && draft.movesPerCreature > 0)) {
    errors.push('settings.json: draft.rounds, draft.optionsPerRound and draft.movesPerCreature must be positive');
  } else if (draftable < draft.rounds * draft.optionsPerRound) {
    errors.push(`settings.json: the draft needs ${draft.rounds * draft.optionsPerRound} creatures with at least one attack, but creatures.json only has ${draftable}`);
  }
  errors.push(...validateAi(raw.settings.ai));
  for (const [status, list] of Object.entries(raw.settings.statusImmunity || {})) {
    if (!STATUSES.includes(status)) errors.push(`settings.json: statusImmunity has unknown status "${status}"`);
    for (const t of list) if (!typeIds.has(t)) errors.push(`settings.json: statusImmunity.${status} lists unknown type "${t}"`);
  }

  const team = raw.champion.team || [];
  if (!team.length) errors.push('champion.json: team is empty');
  for (const slot of team) {
    if (!creatureIds.has(slot.creature)) errors.push(`champion.json: unknown creature "${slot.creature}"`);
    if (!slot.moves || !slot.moves.length) errors.push(`champion.json: "${slot.creature}" has no moves`);
    for (const m of slot.moves || []) if (!moveIds.has(m)) errors.push(`champion.json: "${slot.creature}" has unknown move "${m}"`);
  }
  return errors;
}

// The "ai" section of settings.json: how readily the champion switches out of a bad matchup.
const AI_FIELDS = {
  switchEagerness: { check: (v) => v >= 0 && v <= 100, need: 'a percent from 0 to 100 (0 turns switching off)' },
  switchMinMargin: { check: (v) => v >= 0, need: 'a number of 0 or more' },
  switchCooldownTurns: { check: (v) => Number.isInteger(v) && v >= 0, need: 'a whole number of turns, 0 or more' },
};

function validateAi(ai) {
  if (ai == null || typeof ai !== 'object' || Array.isArray(ai)) {
    return [`settings.json: the "ai" section is missing; it needs ${Object.keys(AI_FIELDS).join(', ')}`];
  }
  const errors = [];
  for (const [field, { check, need }] of Object.entries(AI_FIELDS)) {
    const v = ai[field];
    if (v === undefined) errors.push(`settings.json: ai.${field} is missing; it must be ${need}`);
    else if (typeof v !== 'number' || !Number.isFinite(v) || !check(v)) errors.push(`settings.json: ai.${field} is ${JSON.stringify(v)}, but it must be ${need}`);
  }
  return errors;
}

// Damage multiplier of one attacking type against a creature's type(s).
export function effectiveness(data, attackType, defenderTypes) {
  const row = data.chart[attackType] || {};
  const b = data.settings.battle;
  let mult = 1;
  for (const d of defenderTypes) {
    if ((row.none || []).includes(d)) return 0;
    if ((row.strong || []).includes(d)) mult *= b.strongMultiplier;
    else if ((row.weak || []).includes(d)) mult *= b.weakMultiplier;
  }
  return mult;
}

// Plain-English description of what a move does beyond damage.
export function describeMove(move) {
  const parts = [];
  if (move.priority > 0) parts.push('Strikes first');
  if (hasHighCrit(move)) parts.push('High critical-hit chance');
  const statNames = { atk: 'Attack', def: 'Defense', spa: 'Sp. Attack', spd: 'Sp. Defense', spe: 'Speed' };
  const statusVerb = { burn: 'burn', poison: 'poison', paralysis: 'paralyse', sleep: 'put to sleep' };
  let notYet = false;
  for (const e of move.effects || []) {
    if (!isSupportedEffect(e)) {
      notYet = true;
      continue;
    }
    const chance = e.chance != null && e.chance < 100 ? `${e.chance}% chance to ` : '';
    const cap = (s) => (chance ? chance + s : s[0].toUpperCase() + s.slice(1));
    if (e.type === 'status') parts.push(cap(`${statusVerb[e.status]} the foe`));
    if (e.type === 'stage') {
      const who = e.target === 'self' ? 'own' : "foe's";
      const dir = e.stages > 0 ? 'raise' : 'lower';
      const amount = Math.abs(e.stages) > 1 ? ' sharply' : '';
      parts.push(cap(`${dir} ${who} ${statNames[e.stat]}${amount}`));
    }
    if (e.type === 'recoil') parts.push(`User takes ${e.percent}% of the damage dealt`);
    if (e.type === 'drain') parts.push(`Heals the user for ${e.percent}% of the damage dealt`);
    if (e.type === 'heal') parts.push(`Restores ${e.percent}% of max HP`);
    if (e.type === 'flinch') parts.push(cap('make the foe flinch'));
  }
  // An attack with no power (fixed or variable damage) deals nothing until #10 is built.
  if (move.category !== 'status' && !isAttack(move)) parts.push('Damage not in battle yet');
  if (notYet) parts.push('Special effect (not in battle yet)');
  return parts.join('. ');
}
