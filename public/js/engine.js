// Battle engine. Pure logic, no DOM: it takes actions and returns a list of events
// that the UI plays back. All numbers come from data/settings.json.
import { makeRng } from './rng.js';
import { effectiveness, STAGE_STATS, isAttack, supportedEffects, hasHighCrit } from './data.js';

export const other = (side) => (side === 'player' ? 'foe' : 'player');

const STAT_NAMES = { atk: 'Attack', def: 'Defense', spa: 'Sp. Attack', spd: 'Sp. Defense', spe: 'Speed' };

export function calcStats(base, level, mult = 1) {
  const scale = (level / 100) * mult;
  const out = { hp: Math.floor((base.hp * 2.5 + 110) * scale) };
  for (const s of STAGE_STATS) out[s] = Math.floor((base[s] * 2 + 36) * scale);
  return out;
}

export function makeFighter(data, slot, mult = 1) {
  const c = data.creatureById[slot.creature];
  const stats = calcStats(c.stats, data.settings.level, mult);
  return {
    id: c.id,
    name: c.name,
    types: c.types,
    stats,
    maxHp: stats.hp,
    hp: stats.hp,
    moves: slot.moves.slice(),
    status: null,
    sleepTurns: 0,
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    flinched: false,
  };
}

export function createBattle(data, playerTeam, seed) {
  const champ = data.champion;
  return {
    data,
    rng: makeRng(seed),
    turn: 0,
    phase: 'choose', // 'choose' | 'forceSwitch' | 'over'
    winner: null,
    sides: {
      player: { name: 'You', active: 0, team: playerTeam.map((s) => makeFighter(data, s)) },
      foe: { name: champ.name, active: 0, team: champ.team.map((s) => makeFighter(data, s, champ.statMultiplier || 1)) },
    },
  };
}

export const stageMult = (n) => (n >= 0 ? (2 + n) / 2 : 2 / (2 - n));
export const activeOf = (state, side) => state.sides[side].team[state.sides[side].active];
export const living = (state, side) =>
  state.sides[side].team.map((f, i) => (f.hp > 0 ? i : -1)).filter((i) => i >= 0);

export function effectiveSpeed(f) {
  return f.stats.spe * stageMult(f.stages.spe) * (f.status === 'paralysis' ? 0.5 : 1);
}

// opts.crit / opts.roll let callers ask for a specific outcome (used by the AI and tests).
export function calcDamage(state, attacker, defender, move, opts = {}) {
  const data = state.data;
  const b = data.settings.battle;
  const eff = effectiveness(data, move.type, defender.types);
  // Status moves and attacks with no power (null or 0) deal no damage and draw no random numbers.
  if (!isAttack(move) || eff === 0) return { damage: 0, eff, crit: false };
  const physical = move.category === 'physical';
  let atk = attacker.stats[physical ? 'atk' : 'spa'] * stageMult(attacker.stages[physical ? 'atk' : 'spa']);
  const def = defender.stats[physical ? 'def' : 'spd'] * stageMult(defender.stages[physical ? 'def' : 'spd']);
  if (physical && attacker.status === 'burn') atk *= 0.5;
  const crit = opts.crit != null ? opts.crit : state.rng.chance(hasHighCrit(move) ? b.highCritChancePercent : b.critChancePercent);
  const roll = opts.roll != null ? opts.roll : (b.randomMinPercent + state.rng.next() * (100 - b.randomMinPercent)) / 100;
  let dmg = b.damageScale * move.power * (atk / def) + 2;
  if (attacker.types.includes(move.type)) dmg *= b.sameTypeBonus;
  dmg *= eff * roll * (crit ? b.critMultiplier : 1);
  return { damage: Math.max(1, Math.floor(dmg)), eff, crit };
}

function label(state, side) {
  const f = activeOf(state, side);
  return side === 'foe' ? `The foe's ${f.name}` : `Your ${f.name}`;
}

function setHp(state, side, events, hp) {
  const f = activeOf(state, side);
  f.hp = Math.max(0, Math.min(f.maxHp, Math.round(hp)));
  events.push({ t: 'hp', side, idx: state.sides[side].active, hp: f.hp });
}

function checkFaint(state, side, events) {
  const f = activeOf(state, side);
  if (f.hp > 0 || f.faintLogged) return;
  f.faintLogged = true;
  f.status = null;
  events.push({ t: 'faint', side, idx: state.sides[side].active });
  events.push({ t: 'msg', text: `${label(state, side)} fainted!` });
  if (!living(state, side).length && !state.winner) {
    state.winner = other(side);
    state.phase = 'over';
  }
}

function applyStatus(state, side, status, events, announceFail) {
  const f = activeOf(state, side);
  if (f.hp <= 0) return;
  const immune = (state.data.settings.statusImmunity[status] || []).some((t) => f.types.includes(t));
  if (f.status || immune) {
    if (announceFail) events.push({ t: 'msg', text: immune ? `It doesn't affect ${label(state, side).replace(/^The/, 'the').replace(/^Your/, 'your')}.` : 'But it failed!' });
    return;
  }
  const b = state.data.settings.battle;
  f.status = status;
  if (status === 'sleep') f.sleepTurns = b.sleepMinTurns + state.rng.int(b.sleepMaxTurns - b.sleepMinTurns + 1);
  const text = { burn: 'was burned', poison: 'was poisoned', paralysis: 'was paralysed', sleep: 'fell asleep' }[status];
  events.push({ t: 'status', side, idx: state.sides[side].active, status });
  events.push({ t: 'msg', text: `${label(state, side)} ${text}!` });
}

function applyStage(state, side, stat, stages, events) {
  const f = activeOf(state, side);
  if (f.hp <= 0) return;
  const before = f.stages[stat];
  f.stages[stat] = Math.max(-6, Math.min(6, before + stages));
  if (f.stages[stat] === before) {
    events.push({ t: 'msg', text: `${label(state, side)}'s ${STAT_NAMES[stat]} can't go any ${stages > 0 ? 'higher' : 'lower'}!` });
    return;
  }
  const word = stages > 0 ? (stages > 1 ? 'rose sharply' : 'rose') : stages < -1 ? 'fell sharply' : 'fell';
  events.push({ t: 'stages', side, idx: state.sides[side].active, stages: { ...f.stages } });
  events.push({ t: 'msg', text: `${label(state, side)}'s ${STAT_NAMES[stat]} ${word}!` });
}

function doSwitch(state, side, idx, events) {
  const s = state.sides[side];
  const old = s.team[s.active];
  old.stages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  s.active = idx;
  const f = s.team[idx];
  events.push({ t: 'switch', side, idx });
  events.push({ t: 'msg', text: side === 'foe' ? `${s.name} sent out ${f.name}!` : `Go, ${f.name}!` });
}

function doMove(state, side, move, events, movedFirst) {
  const b = state.data.settings.battle;
  const foeSide = other(side);
  const me = activeOf(state, side);
  const foe = activeOf(state, foeSide);
  if (me.hp <= 0 || state.phase === 'over') return;

  if (me.status === 'sleep') {
    if (me.sleepTurns > 0) {
      me.sleepTurns--;
      events.push({ t: 'msg', text: `${label(state, side)} is fast asleep.` });
      return;
    }
    me.status = null;
    events.push({ t: 'status', side, idx: state.sides[side].active, status: null });
    events.push({ t: 'msg', text: `${label(state, side)} woke up!` });
  }
  if (me.flinched) {
    events.push({ t: 'msg', text: `${label(state, side)} flinched and couldn't move!` });
    return;
  }
  if (me.status === 'paralysis' && state.rng.chance(b.paralysisSkipChancePercent)) {
    events.push({ t: 'msg', text: `${label(state, side)} is paralysed! It can't move!` });
    return;
  }

  // The move is now used (it counts even if it then misses or fails). Draws no random numbers.
  events.push({ t: 'move', side, idx: state.sides[side].active, move: move.id });
  events.push({ t: 'msg', text: `${label(state, side)} used ${move.name}!` });
  // Effects that are not supported yet (see UNSUPPORTED in data.js) are skipped entirely.
  const effects = supportedEffects(move);
  // highCrit only changes the critical-hit chance of damage, so it does not count as "doing something".
  const doesSomething = effects.some((e) => e.type !== 'highCrit');
  if (move.category === 'status' && !doesSomething) {
    events.push({ t: 'msg', text: 'But nothing happened!' });
    return;
  }
  const needsTarget = move.category !== 'status' || effects.some((e) => e.type === 'status' || e.target === 'foe');
  if (needsTarget && foe.hp <= 0) {
    events.push({ t: 'msg', text: 'But there was no target!' });
    return;
  }
  if (move.accuracy != null && !state.rng.chance(move.accuracy)) {
    events.push({ t: 'msg', text: 'It missed!' });
    return;
  }

  // Any physical or special move, with or without power, does nothing to a type immune to it.
  // This draws no random numbers (calcDamage returns before its rolls when immune).
  if (move.category !== 'status' && effectiveness(state.data, move.type, foe.types) === 0) {
    events.push({ t: 'msg', text: `It doesn't affect ${foe.name}...` });
    return;
  }
  // An attack with no power and nothing else it can do yet.
  if (!isAttack(move) && !doesSomething) {
    events.push({ t: 'msg', text: 'But nothing happened!' });
    return;
  }

  let dealt = 0;
  if (isAttack(move)) {
    const { damage, eff, crit } = calcDamage(state, me, foe, move);
    dealt = Math.min(damage, foe.hp);
    events.push({ t: 'anim', side, kind: 'attack' });
    setHp(state, foeSide, events, foe.hp - damage);
    if (crit) events.push({ t: 'msg', text: 'A critical hit!' });
    if (eff > 1) events.push({ t: 'msg', text: "It's super effective!" });
    else if (eff < 1) events.push({ t: 'msg', text: "It's not very effective..." });
  }

  for (const e of effects) {
    if (e.chance != null && e.chance < 100 && !state.rng.chance(e.chance)) continue;
    if (e.type === 'status') applyStatus(state, foeSide, e.status, events, move.category === 'status');
    else if (e.type === 'stage') applyStage(state, e.target === 'self' ? side : foeSide, e.stat, e.stages, events);
    else if (e.type === 'recoil' && dealt > 0) {
      setHp(state, side, events, me.hp - Math.max(1, Math.floor((dealt * e.percent) / 100)));
      events.push({ t: 'msg', text: `${label(state, side)} was hurt by recoil!` });
    } else if (e.type === 'drain' && dealt > 0 && me.hp < me.maxHp) {
      setHp(state, side, events, me.hp + Math.max(1, Math.floor((dealt * e.percent) / 100)));
      events.push({ t: 'msg', text: `${label(state, side)} drained some energy!` });
    } else if (e.type === 'heal') {
      if (me.hp >= me.maxHp) events.push({ t: 'msg', text: "But its HP is already full!" });
      else {
        setHp(state, side, events, me.hp + Math.floor((me.maxHp * e.percent) / 100));
        events.push({ t: 'msg', text: `${label(state, side)} recovered health!` });
      }
    } else if (e.type === 'flinch' && movedFirst && foe.hp > 0) foe.flinched = true;
  }

  checkFaint(state, foeSide, events);
  checkFaint(state, side, events);
}

// Runs one full turn. Each action is { type: 'move', index } or { type: 'switch', index }.
// pickFoeSwitch(state) chooses the foe's replacement when its creature faints.
export function runTurn(state, playerAction, foeAction, pickFoeSwitch) {
  if (state.phase !== 'choose') throw new Error(`Cannot take a turn during phase "${state.phase}"`);
  const events = [];
  state.turn++;
  const actions = { player: playerAction, foe: foeAction };
  for (const side of ['player', 'foe']) activeOf(state, side).flinched = false;

  for (const side of ['player', 'foe']) {
    const a = actions[side];
    if (a.type !== 'switch') continue;
    const target = state.sides[side].team[a.index];
    if (!target || target.hp <= 0 || a.index === state.sides[side].active) throw new Error('Invalid switch');
    doSwitch(state, side, a.index, events);
  }

  const movers = ['player', 'foe']
    .filter((side) => actions[side].type === 'move')
    .map((side) => {
      const f = activeOf(state, side);
      const move = state.data.moveById[f.moves[actions[side].index]];
      if (!move) throw new Error('Invalid move');
      return { side, move, priority: move.priority || 0, speed: effectiveSpeed(f), tie: state.rng.next() };
    })
    .sort((a, b) => b.priority - a.priority || b.speed - a.speed || b.tie - a.tie);

  movers.forEach((m, i) => doMove(state, m.side, m.move, events, i === 0 && movers.length > 1));

  // End-of-turn damage from burn and poison.
  const b = state.data.settings.battle;
  for (const side of ['player', 'foe']) {
    if (state.phase === 'over') break;
    const f = activeOf(state, side);
    if (f.hp <= 0) continue;
    const pct = f.status === 'burn' ? b.burnDamagePercent : f.status === 'poison' ? b.poisonDamagePercent : 0;
    if (!pct) continue;
    setHp(state, side, events, f.hp - Math.max(1, Math.floor((f.maxHp * pct) / 100)));
    events.push({ t: 'msg', text: `${label(state, side)} was hurt by its ${f.status}!` });
    checkFaint(state, side, events);
  }

  if (state.phase !== 'over') {
    if (activeOf(state, 'foe').hp <= 0) {
      const alive = living(state, 'foe');
      const pick = pickFoeSwitch ? pickFoeSwitch(state) : alive[0];
      doSwitch(state, 'foe', alive.includes(pick) ? pick : alive[0], events);
    }
    if (activeOf(state, 'player').hp <= 0) state.phase = 'forceSwitch';
  }
  if (state.phase === 'over') events.push({ t: 'over', winner: state.winner });
  return events;
}

// Used when the player's creature has fainted and they must send in another.
export function forceSwitch(state, index) {
  if (state.phase !== 'forceSwitch') throw new Error('No switch is needed right now');
  const target = state.sides.player.team[index];
  if (!target || target.hp <= 0) throw new Error('Invalid switch');
  const events = [];
  doSwitch(state, 'player', index, events);
  state.phase = 'choose';
  return events;
}
