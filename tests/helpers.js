import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildData, FILES } from '../public/js/data.js';

export function readRaw() {
  const raw = {};
  for (const f of FILES) {
    raw[f] = JSON.parse(readFileSync(fileURLToPath(new URL(`../public/data/${f}.json`, import.meta.url)), 'utf8'));
  }
  return raw;
}

export const loadTestData = () => buildData(readRaw());
