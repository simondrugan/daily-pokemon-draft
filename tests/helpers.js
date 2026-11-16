import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildData, FILES } from '../public/js/data.js';

function readDir(dir) {
  const raw = {};
  for (const f of FILES) {
    raw[f] = JSON.parse(readFileSync(fileURLToPath(new URL(`${dir}/${f}.json`, import.meta.url)), 'utf8'));
  }
  return raw;
}

// The real game data in public/data/ (the owner's content).
export const readRaw = () => readDir('../public/data');
export const loadTestData = () => buildData(readRaw());

// A small hand-written data set in tests/fixtures/ for testing battle and draft rules,
// so the rule tests do not break when the owner changes the game content.
export const readFixtureRaw = () => readDir('./fixtures');
export const loadFixtureData = () => buildData(readFixtureRaw());
