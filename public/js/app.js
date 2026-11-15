// User interface: home, draft, battle and result screens.
import { loadData, effectiveness, describeMove, STATS } from './data.js';
import { generateDraft, dailySeed, todayString, teamCoverage, defensiveProfile } from './draft.js';
import { createBattle, runTurn, forceSwitch, activeOf, living } from './engine.js';
import { chooseAction, chooseSwitch } from './ai.js';
import { spriteSVG } from './sprite.js';
import { hashString } from './rng.js';

const $ = (sel, root = document) => root.querySelector(sel);
const appEl = $('#app');
const STAT_LABELS = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
const STATUS_LABELS = { burn: 'BRN', poison: 'PSN', paralysis: 'PAR', sleep: 'SLP' };
const SPEEDS = [
  { id: '1', label: '1×', ms: 750 },
  { id: '2', label: '2×', ms: 375 },
  { id: '4', label: '4×', ms: 150 },
  { id: 'skip', label: 'Skip', ms: 0 },
];

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('summit:' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('summit:' + key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

let data;
const app = {
  mode: 'daily', seed: 0, date: todayString(),
  draft: null, round: 0, team: [],
  battle: null, view: null, busy: false, showSwitch: false, log: [],
  speed: store.get('speed', '1'), hints: store.get('hints', true),
};

// ---------- small render helpers ----------

const typeBadge = (id) => {
  const t = data.typeById[id];
  return `<span class="type" style="--c:${t.color}">${t.name}</span>`;
};
const typeBadges = (ids) => ids.map(typeBadge).join('');
const effLabel = (m) => (m === 0 ? 'No effect' : m > 1 ? 'Super effective' : m < 1 ? 'Not very effective' : 'Neutral');
const effClass = (m) => (m === 0 ? 'eff-none' : m > 1 ? 'eff-strong' : m < 1 ? 'eff-weak' : 'eff-neutral');

function moveRow(id) {
  const m = data.moveById[id];
  const nums = m.category === 'status' ? 'Status' : `${m.category === 'physical' ? 'Physical' : 'Special'} · ${m.power} power`;
  const acc = m.accuracy == null ? 'never misses' : `${m.accuracy}% accuracy`;
  const extra = describeMove(m);
  return `<li class="move-row">${typeBadge(m.type)}<div><strong>${m.name}</strong><small>${nums} · ${acc}${extra ? ' · ' + extra : ''}</small></div></li>`;
}

function profileHTML(types) {
  const p = defensiveProfile(data, types);
  const line = (label, list) => (list.length ? `<div class="profile-line"><span>${label}</span>${typeBadges(list)}</div>` : '');
  return line('Weak to', p.weak) + line('Resists', p.resist) + line('Immune to', p.immune);
}

function statBars(stats) {
  return `<div class="stats">${STATS.map((s) => `<div class="stat"><span>${STAT_LABELS[s]}</span><div class="bar"><i style="width:${Math.min(100, (stats[s] / 140) * 100)}%"></i></div><b>${stats[s]}</b></div>`).join('')}</div>`;
}

function creatureCard(slot, { button = '', compact = false } = {}) {
  const c = data.creatureById[slot.creature];
  return `<article class="card ${compact ? 'compact' : ''}">
    <div class="card-head">${spriteSVG(data, c, compact ? 56 : 88)}<div><h3>${c.name}</h3><div>${typeBadges(c.types)}</div></div></div>
    ${compact ? '' : statBars(c.stats)}
    <ul class="moves">${slot.moves.map(moveRow).join('')}</ul>
    ${compact ? '' : `<div class="profile">${profileHTML(c.types)}</div>`}
    ${button}
  </article>`;
}

// ---------- modal: type chart and help ----------

function openModal(html) {
  $('#modal-body').innerHTML = html;
  $('#modal').hidden = false;
}
function closeModal() { $('#modal').hidden = true; }

function typeChartHTML() {
  const head = data.types.map((t) => `<th><span class="type vertical" style="--c:${t.color}">${t.name}</span></th>`).join('');
  const rows = data.types.map((a) => {
    const cells = data.types.map((d) => {
      const m = effectiveness(data, a.id, [d.id]);
      const text = m === 0 ? '0' : m > 1 ? `${m}×` : m < 1 ? '½' : '';
      return `<td class="${effClass(m)}" title="${a.name} → ${d.name}: ${effLabel(m)}">${text}</td>`;
    }).join('');
    return `<tr><th>${typeBadge(a.id)}</th>${cells}</tr>`;
  }).join('');
  const list = data.types.map((t) => {
    const row = data.chart[t.id];
    const p = defensiveProfile(data, [t.id]);
    return `<div class="type-summary">${typeBadge(t.id)}
      <div class="profile-line"><span>Hits hard</span>${typeBadges(row.strong) || '—'}</div>
      <div class="profile-line"><span>Weak to</span>${typeBadges(p.weak) || '—'}</div>
      <div class="profile-line"><span>Resists</span>${typeBadges([...p.resist, ...p.immune]) || '—'}</div></div>`;
  }).join('');
  return `<h2>Type chart</h2>
    <p class="muted">Rows attack, columns defend. <b class="eff-strong pill">2×</b> super effective · <b class="eff-weak pill">½</b> not very effective · <b class="eff-none pill">0</b> no effect. A creature with two types multiplies both.</p>
    <div class="chart-wrap"><table class="chart"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
    <h3>By type</h3><div class="type-summaries">${list}</div>`;
}

const helpHTML = () => `<h2>How to play</h2>
  <ol class="help">
    <li><b>Draft.</b> Over ${data.settings.draft.rounds} rounds you're shown ${data.settings.draft.optionsPerRound} creatures, each with a randomly rolled set of moves. Pick one per round.</li>
    <li><b>Balance your team.</b> The coverage panel shows which attack types your team is weak to and which types you can hit hard. Check the champion's team before you pick.</li>
    <li><b>Battle.</b> Each turn choose a move or switch creature. Faster creatures act first. Attacks that match the user's type do extra damage.</li>
    <li><b>Win</b> by knocking out all of ${data.champion.name}'s creatures.</li>
  </ol>
  <p class="muted">Status effects: <b>Burn</b> halves physical damage and hurts each turn. <b>Poison</b> hurts more each turn. <b>Paralysis</b> halves speed and sometimes costs a turn. <b>Sleep</b> costs 1–3 turns.</p>
  <p class="muted">The daily draft is the same for everyone and changes at midnight UTC.</p>`;

// ---------- home ----------

function renderHome() {
  const record = store.get('daily:' + app.date, null);
  const done = record ? `<p class="muted">Today's result: ${record.won ? '🏆 Won' : '💀 Lost'} in ${record.turns} turns. You can replay it for practice.</p>` : '';
  appEl.innerHTML = `<section class="home">
    <h1>Draft six. Climb the summit.</h1>
    <p>Pick a team one creature at a time from random options with random move sets, then battle <b>${data.champion.name}</b>.</p>
    <p class="muted">${data.champion.intro || ''}</p>
    <div class="home-actions">
      <button class="primary" id="daily">Play today's draft <small>${app.date}</small></button>
      <button id="random">Random draft</button>
    </div>
    ${done}
    <h2>Champion's team</h2>
    <div class="scout">${scoutHTML()}</div>
  </section>`;
  $('#daily').onclick = () => startDraft('daily');
  $('#random').onclick = () => startDraft('random');
}

function scoutHTML() {
  return data.champion.team.map((slot) => {
    const c = data.creatureById[slot.creature];
    return `<div class="scout-item">${spriteSVG(data, c, 52)}<b>${c.name}</b><div>${typeBadges(c.types)}</div></div>`;
  }).join('');
}

// ---------- draft ----------

function startDraft(mode) {
  app.mode = mode;
  app.date = todayString();
  app.seed = mode === 'daily' ? dailySeed(app.date) : (Math.random() * 2 ** 32) >>> 0;
  app.draft = generateDraft(data, app.seed);
  app.round = 0;
  app.team = [];
  renderDraft();
}

function coverageHTML(team) {
  const cov = teamCoverage(data, team);
  const cells = cov.map((c) => {
    const net = c.weak - c.resist;
    const cls = c.weak >= 3 || net >= 2 ? 'bad' : net <= -1 ? 'good' : '';
    return `<tr class="${cls}"><td>${typeBadge(c.type)}</td><td>${c.weak || '–'}</td><td>${c.resist || '–'}</td><td>${c.canHit ? '✓' : '<span class="miss">✗</span>'}</td></tr>`;
  }).join('');
  return `<table class="coverage"><thead><tr><th>Type</th><th title="Team members weak to this attack type">Weak</th><th title="Team members that resist this attack type">Resist</th><th title="Your team has an attack that is super effective against this type">Can hit</th></tr></thead><tbody>${cells}</tbody></table>`;
}

function renderDraft() {
  const total = app.draft.length;
  const options = app.draft[app.round];
  appEl.innerHTML = `<section class="draft">
    <div class="draft-main">
      <h1>Round ${app.round + 1} of ${total} <small>${app.mode === 'daily' ? 'Daily · ' + app.date : 'Random draft'}</small></h1>
      <p class="muted">Pick one. The other two are gone for good.</p>
      <div class="options">${options.map((o, i) => creatureCard(o, { button: `<button class="primary pick" data-i="${i}">Draft ${data.creatureById[o.creature].name}</button>` })).join('')}</div>
    </div>
    <aside class="draft-side">
      <h2>Your team (${app.team.length}/${total})</h2>
      <div class="mini-team">${app.team.map((s) => { const c = data.creatureById[s.creature]; return `<div class="mini" title="${c.name}">${spriteSVG(data, c, 44)}<span>${c.name}</span></div>`; }).join('') || '<p class="muted">Nobody yet.</p>'}</div>
      <h2>Team coverage</h2>
      <p class="muted small">Red rows are types your team struggles against. ✗ means you have no attack that hits that type hard.</p>
      ${coverageHTML(app.team)}
      <h2>Champion's team</h2>
      <div class="scout small">${scoutHTML()}</div>
    </aside>
  </section>`;
  appEl.querySelectorAll('.pick').forEach((btn) => {
    btn.onclick = () => {
      app.team.push(options[+btn.dataset.i]);
      app.round++;
      if (app.round >= total) renderTeamReview();
      else { renderDraft(); window.scrollTo(0, 0); }
    };
  });
}

function renderTeamReview() {
  appEl.innerHTML = `<section class="review">
    <h1>Your team</h1>
    <p class="muted">Tap a creature to choose who leads. Then head up the mountain.</p>
    <div class="options review-grid">${app.team.map((s, i) => `<div class="lead-pick ${i === 0 ? 'lead' : ''}" data-i="${i}">${creatureCard(s, { compact: true })}<span class="lead-tag">${i === 0 ? 'Leads' : 'Make lead'}</span></div>`).join('')}</div>
    <div class="home-actions"><button class="primary" id="fight">Challenge ${data.champion.name}</button></div>
    <h2>Team coverage</h2>${coverageHTML(app.team)}
  </section>`;
  appEl.querySelectorAll('.lead-pick').forEach((el) => {
    el.onclick = () => {
      const i = +el.dataset.i;
      if (i === 0) return;
      const [lead] = app.team.splice(i, 1);
      app.team.unshift(lead);
      renderTeamReview();
    };
  });
  $('#fight').onclick = startBattle;
  window.scrollTo(0, 0);
}

// ---------- battle ----------

function startBattle() {
  app.battle = createBattle(data, app.team, hashString('battle:' + app.seed + ':' + Date.now()));
  const snap = (side) => ({
    active: 0,
    hp: app.battle.sides[side].team.map((f) => f.hp),
    status: app.battle.sides[side].team.map(() => null),
  });
  app.view = { player: snap('player'), foe: snap('foe') };
  app.log = [`${data.champion.name} wants to battle!`];
  app.busy = false;
  app.showSwitch = false;
  renderBattle();
}

function renderBattle() {
  const side = (s) => `<div class="fighter ${s}" id="f-${s}">
      <div class="plate">
        <div class="plate-top"><b class="f-name"></b><span class="f-status"></span></div>
        <div class="f-types"></div>
        <div class="hpbar"><i></i></div>
        <div class="plate-bottom"><span class="f-hp"></span><span class="pips"></span></div>
        <div class="f-hint"></div>
      </div>
      <div class="f-sprite"></div>
    </div>`;
  appEl.innerHTML = `<section class="battle">
    <div class="field">${side('foe')}${side('player')}</div>
    <div class="battle-bar">
      <div class="speed" role="group" aria-label="Battle speed">${SPEEDS.map((s) => `<button data-speed="${s.id}" class="${s.id === app.speed ? 'on' : ''}">${s.label}</button>`).join('')}</div>
      <label class="hint-toggle"><input type="checkbox" id="hints" ${app.hints ? 'checked' : ''}> Matchup hints</label>
    </div>
    <div class="log" id="log" aria-live="polite"></div>
    <div class="controls" id="controls"></div>
  </section>`;
  appEl.querySelectorAll('[data-speed]').forEach((b) => {
    b.onclick = () => {
      app.speed = b.dataset.speed;
      store.set('speed', app.speed);
      appEl.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === b));
    };
  });
  $('#hints').onchange = (e) => {
    app.hints = e.target.checked;
    store.set('hints', app.hints);
    refreshField();
    renderControls();
  };
  refreshField(true);
  renderLog();
  renderControls();
}

function refreshField(newSprites = false) {
  for (const s of ['foe', 'player']) {
    const v = app.view[s];
    const f = app.battle.sides[s].team[v.active];
    const c = data.creatureById[f.id];
    const el = $('#f-' + s);
    const hp = v.hp[v.active];
    const pct = (hp / f.maxHp) * 100;
    $('.f-name', el).textContent = f.name;
    $('.f-types', el).innerHTML = typeBadges(f.types);
    const st = v.status[v.active];
    $('.f-status', el).innerHTML = st ? `<span class="status ${st}">${STATUS_LABELS[st]}</span>` : '';
    const bar = $('.hpbar i', el);
    bar.style.width = pct + '%';
    bar.className = pct > 50 ? 'ok' : pct > 20 ? 'mid' : 'low';
    $('.f-hp', el).textContent = `${hp} / ${f.maxHp}`;
    $('.pips', el).innerHTML = v.hp.map((h, i) => `<i class="${h <= 0 ? 'out' : i === v.active ? 'cur' : ''}"></i>`).join('');
    $('.f-hint', el).innerHTML = app.hints && s === 'foe' ? profileHTML(f.types) : '';
    const sp = $('.f-sprite', el);
    if (newSprites || sp.dataset.id !== f.id) {
      sp.dataset.id = f.id;
      sp.innerHTML = spriteSVG(data, c, 120);
    }
    sp.classList.toggle('fainted', hp <= 0);
  }
}

function renderLog() {
  const el = $('#log');
  if (!el) return;
  el.innerHTML = app.log.slice(-40).map((l) => `<p>${l}</p>`).join('');
  el.scrollTop = el.scrollHeight;
}

function renderControls() {
  const el = $('#controls');
  if (!el) return;
  const b = app.battle;
  if (app.busy) { el.innerHTML = '<p class="muted waiting">…</p>'; return; }
  if (b.phase === 'over') {
    el.innerHTML = `<button class="primary" id="to-result">See result</button>`;
    $('#to-result').onclick = renderResult;
    return;
  }
  const me = activeOf(b, 'player');
  const foe = activeOf(b, 'foe');
  const forced = b.phase === 'forceSwitch';
  if (forced || app.showSwitch) {
    const items = b.sides.player.team.map((f, i) => {
      const disabled = f.hp <= 0 || (i === b.sides.player.active && !forced) || (forced && f.hp <= 0);
      const danger = Math.max(...foe.types.map((t) => effectiveness(data, t, f.types)));
      const hint = app.hints && f.hp > 0 ? `<small class="${danger > 1 ? 'eff-weak-t' : danger < 1 ? 'eff-strong-t' : ''}">${danger > 1 ? `Weak to ${foe.name}'s type` : danger < 1 ? `Resists ${foe.name}'s type` : ''}</small>` : '';
      return `<button class="switch-btn" data-i="${i}" ${disabled ? 'disabled' : ''}>
        ${spriteSVG(data, data.creatureById[f.id], 40)}
        <span><b>${f.name}</b> ${typeBadges(f.types)}<br><small>${f.hp <= 0 ? 'Fainted' : `${f.hp} / ${f.maxHp} HP`}${f.status ? ' · ' + STATUS_LABELS[f.status] : ''}</small>${hint}</span></button>`;
    }).join('');
    el.innerHTML = `<h3>${forced ? 'Choose your next creature' : 'Switch to…'}</h3><div class="switch-list">${items}</div>${forced ? '' : '<button id="back">Back</button>'}`;
    el.querySelectorAll('.switch-btn').forEach((btn) => {
      btn.onclick = () => (forced ? act(() => forceSwitch(b, +btn.dataset.i)) : takeTurn({ type: 'switch', index: +btn.dataset.i }));
    });
    if (!forced) $('#back').onclick = () => { app.showSwitch = false; renderControls(); };
    return;
  }
  const moves = me.moves.map((id, i) => {
    const m = data.moveById[id];
    const eff = effectiveness(data, m.type, foe.types);
    const hint = app.hints && m.category !== 'status' ? `<small class="eff ${effClass(eff)}">${effLabel(eff)}</small>` : '';
    const info = m.category === 'status' ? 'Status' : `${m.power} pow`;
    return `<button class="move-btn" data-i="${i}" style="--c:${data.typeById[m.type].color}" title="${describeMove(m)}">
      <b>${m.name}</b><span>${data.typeById[m.type].name} · ${info}${m.accuracy != null && m.accuracy < 100 ? ` · ${m.accuracy}%` : ''}</span>${hint}</button>`;
  }).join('');
  const canSwitch = living(b, 'player').length > 1;
  el.innerHTML = `<div class="move-grid">${moves}</div><button id="switch" ${canSwitch ? '' : 'disabled'}>Switch creature</button>`;
  el.querySelectorAll('.move-btn').forEach((btn) => (btn.onclick = () => takeTurn({ type: 'move', index: +btn.dataset.i })));
  $('#switch').onclick = () => { app.showSwitch = true; renderControls(); };
}

function takeTurn(action) {
  app.showSwitch = false;
  act(() => runTurn(app.battle, action, chooseAction(app.battle, 'foe'), (s) => chooseSwitch(s, 'foe')));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const speedMs = () => SPEEDS.find((s) => s.id === app.speed).ms;

async function act(fn) {
  if (app.busy) return;
  app.busy = true;
  renderControls();
  const events = fn();
  for (const e of events) {
    const ms = speedMs();
    if (e.t === 'msg') {
      app.log.push(e.text);
      renderLog();
      if (ms) await sleep(ms);
    } else if (e.t === 'hp') {
      app.view[e.side].hp[e.idx] = e.hp;
      refreshField();
      if (ms) await sleep(ms * 0.6);
    } else if (e.t === 'status') {
      app.view[e.side].status[e.idx] = e.status;
      refreshField();
    } else if (e.t === 'faint') {
      app.view[e.side].status[e.idx] = null;
      refreshField();
    } else if (e.t === 'switch') {
      app.view[e.side].active = e.idx;
      refreshField();
    } else if (e.t === 'anim' && ms) {
      const sp = $(`#f-${e.side} .f-sprite`);
      if (sp) { sp.classList.remove('lunge'); void sp.offsetWidth; sp.classList.add('lunge'); }
      await sleep(ms * 0.3);
    }
  }
  app.busy = false;
  refreshField();
  renderControls();
}

// ---------- result ----------

function renderResult() {
  const b = app.battle;
  const won = b.winner === 'player';
  const mine = b.sides.player.team.map((f) => (f.hp > 0 ? '🟩' : '⬛')).join('');
  const theirs = b.sides.foe.team.map((f) => (f.hp > 0 ? '🟥' : '⬛')).join('');
  if (app.mode === 'daily' && !store.get('daily:' + app.date, null)) {
    store.set('daily:' + app.date, { won, turns: b.turn });
  }
  const share = `Summit Draft ${app.mode === 'daily' ? app.date : '(random)'}\n${won ? '🏆 Beat' : '💀 Lost to'} ${data.champion.name} in ${b.turn} turns\nMe ${mine}\nVs ${theirs}`;
  appEl.innerHTML = `<section class="result">
    <h1>${won ? '🏆 You reached the summit!' : '💀 The summit holds.'}</h1>
    <p>${won ? `You beat ${data.champion.name}` : `${data.champion.name} won`} in ${b.turn} turns.</p>
    <pre class="share">${share}</pre>
    <div class="home-actions">
      <button class="primary" id="share">Copy result</button>
      <button id="rematch">Rematch with this team</button>
      <button id="new">New random draft</button>
      <button id="home2">Home</button>
    </div>
  </section>`;
  $('#share').onclick = async () => {
    try { await navigator.clipboard.writeText(share); $('#share').textContent = 'Copied!'; } catch { $('#share').textContent = 'Select the text above to copy'; }
  };
  $('#rematch').onclick = startBattle;
  $('#new').onclick = () => startDraft('random');
  $('#home2').onclick = renderHome;
}

// ---------- boot ----------

$('#home-btn').onclick = () => {
  if (app.battle && app.battle.phase !== 'over' && $('.battle') && !confirm('Leave this battle?')) return;
  renderHome();
};
$('#chart-btn').onclick = () => data && openModal(typeChartHTML());
$('#help-btn').onclick = () => data && openModal(helpHTML());
$('.modal-close').onclick = closeModal;
$('#modal').onclick = (e) => { if (e.target.id === 'modal') closeModal(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

loadData()
  .then((d) => { data = d; renderHome(); })
  .catch((err) => {
    const list = err.configErrors ? `<ul>${err.configErrors.map((e) => `<li>${e}</li>`).join('')}</ul>` : `<p>${err.message}</p>`;
    appEl.innerHTML = `<section class="home"><h1>Something is wrong with the game data</h1>${list}<p class="muted">Fix the files in the <code>data</code> folder and reload.</p></section>`;
  });
