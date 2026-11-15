// Draws a simple original creature portrait as SVG, generated from the creature's id and types.
import { hashString, makeRng } from './rng.js';

export function spriteSVG(data, creature, size = 96) {
  const rng = makeRng(hashString('sprite:' + creature.id));
  const main = data.typeById[creature.types[0]].color;
  const alt = data.typeById[creature.types[creature.types.length - 1]].color;
  const accent = creature.types.length > 1 ? alt : shade(main, -35);
  const s = creature.stats;
  // Bulky creatures are wider, fast ones are slimmer.
  const rx = 22 + Math.min(12, (s.hp + s.def - 130) / 9);
  const ry = 22 + Math.min(10, (s.spe - 40) / 12) + rng.int(4);
  const cy = 58;
  const parts = [];
  const feature = rng.int(4);
  const top = cy - ry;

  if (rng.chance(55)) {
    // wings or fins
    parts.push(`<path d="M${50 - rx + 4} ${cy} q-22 -${14 + rng.int(12)} -${16 + rng.int(8)} ${10 + rng.int(8)} z" fill="${accent}"/>`);
    parts.push(`<path d="M${50 + rx - 4} ${cy} q22 -${14 + rng.int(12)} ${16 + rng.int(8)} ${10 + rng.int(8)} z" fill="${accent}"/>`);
  }
  if (rng.chance(60)) {
    // tail
    parts.push(`<path d="M${50 + rx - 6} ${cy + ry - 10} q${14 + rng.int(10)} ${2 + rng.int(8)} ${10 + rng.int(8)} -${12 + rng.int(10)}" stroke="${accent}" stroke-width="6" fill="none" stroke-linecap="round"/>`);
  }
  if (feature === 0) {
    // pointed ears
    parts.push(`<path d="M${50 - rx * 0.7} ${top + 10} l-4 -20 l15 12 z" fill="${main}"/><path d="M${50 + rx * 0.7} ${top + 10} l4 -20 l-15 12 z" fill="${main}"/>`);
  } else if (feature === 1) {
    // horns
    parts.push(`<path d="M${50 - rx * 0.5} ${top + 6} q-10 -12 -2 -22" stroke="${accent}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M${50 + rx * 0.5} ${top + 6} q10 -12 2 -22" stroke="${accent}" stroke-width="5" fill="none" stroke-linecap="round"/>`);
  } else if (feature === 2) {
    // back spikes
    for (let i = -2; i <= 2; i++) parts.push(`<path d="M${50 + i * 9 - 5} ${top + 6 + Math.abs(i) * 3} l5 -${12 - Math.abs(i) * 2} l5 ${12 - Math.abs(i) * 2} z" fill="${accent}"/>`);
  } else {
    // antenna
    parts.push(`<path d="M50 ${top + 4} q-6 -14 4 -20" stroke="${accent}" stroke-width="3" fill="none"/><circle cx="54" cy="${top - 16}" r="4" fill="${accent}"/>`);
  }
  // feet
  parts.push(`<ellipse cx="${50 - rx * 0.5}" cy="${cy + ry - 1}" rx="8" ry="5" fill="${shade(main, -30)}"/><ellipse cx="${50 + rx * 0.5}" cy="${cy + ry - 1}" rx="8" ry="5" fill="${shade(main, -30)}"/>`);
  // body and belly
  parts.push(`<ellipse cx="50" cy="${cy}" rx="${rx}" ry="${ry}" fill="${main}"/>`);
  parts.push(`<ellipse cx="50" cy="${cy + ry * 0.35}" rx="${rx * 0.6}" ry="${ry * 0.5}" fill="${shade(main, 45)}" opacity=".7"/>`);
  // eyes
  const ex = rx * 0.38, ey = cy - ry * 0.25, er = 4 + rng.int(3);
  const angry = s.atk > s.spa;
  for (const dx of [-ex, ex]) {
    parts.push(`<circle cx="${50 + dx}" cy="${ey}" r="${er}" fill="#fff"/><circle cx="${50 + dx + 1}" cy="${ey}" r="${er * 0.5}" fill="#1c1c28"/>`);
    if (angry) parts.push(`<path d="M${50 + dx - er * Math.sign(dx) * -1} ${ey - er - 1} l${Math.sign(dx) * -er * 2} ${4}" stroke="#1c1c28" stroke-width="2.5" stroke-linecap="round"/>`);
  }
  parts.push(`<path d="M${50 - 5} ${cy + 4} q5 ${angry ? 3 : 6} 10 0" stroke="#1c1c28" stroke-width="2" fill="none" stroke-linecap="round"/>`);

  return `<svg class="sprite" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${creature.name}">${parts.join('')}</svg>`;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return '#' + [c(n >> 16), c((n >> 8) & 255), c(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
