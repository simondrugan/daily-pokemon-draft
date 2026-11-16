// Loads the JSON config files and checks them for mistakes.
// Everything about types, moves, creatures and the champion lives in /data.

export const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
export const STAGE_STATS = ['atk', 'def', 'spa', 'spd', 'spe'];
export const STATUSES = ['burn', 'poison', 'paralysis', 'sleep'];
export const CATEGORIES = ['physical', 'special', 'status'];
const EFFECT_TYPES = ['status', 'stage', 'recoil', 'drain', 'heal', 'flinch'];

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
    if (m.category !== 'status' && !(m.power > 0)) errors.push(`${at} is an attack but has no power`);
    if (m.accuracy != null && !(m.accuracy > 0 && m.accuracy <= 100)) errors.push(`${at} accuracy must be 1-100 or null`);
    for (const e of m.effects || []) {
      if (!EFFECT_TYPES.includes(e.type)) errors.push(`${at} has unknown effect type "${e.type}"`);
      if (e.type === 'status' && !STATUSES.includes(e.status)) errors.push(`${at} has unknown status "${e.status}"`);
      if (e.type === 'stage') {
        if (!STAGE_STATS.includes(e.stat)) errors.push(`${at} has unknown stat "${e.stat}"`);
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
    if (pool.length < (draft.movesPerCreature || 4)) errors.push(`${at} movePool has fewer moves than movesPerCreature`);
    if (!pool.some((m) => moveMap[m] && moveMap[m].category !== 'status')) errors.push(`${at} has no attacking move in its movePool`);
  }

  if (!(draft.rounds > 0 && draft.optionsPerRound > 0 && draft.movesPerCreature > 0)) {
    errors.push('settings.json: draft.rounds, draft.optionsPerRound and draft.movesPerCreature must be positive');
  } else if (creatures.length < draft.rounds * draft.optionsPerRound) {
    errors.push(`settings.json: the draft needs ${draft.rounds * draft.optionsPerRound} creatures but creatures.json only has ${creatures.length}`);
  }
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
  if (move.highCrit) parts.push('High critical-hit chance');
  const statNames = { atk: 'Attack', def: 'Defense', spa: 'Sp. Attack', spd: 'Sp. Defense', spe: 'Speed' };
  const statusVerb = { burn: 'burn', poison: 'poison', paralysis: 'paralyse', sleep: 'put to sleep' };
  for (const e of move.effects || []) {
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
  return parts.join('. ');
}
