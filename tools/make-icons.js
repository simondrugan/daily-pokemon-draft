// Creates a placeholder icon in public/icons/ for every creature that does not have one yet.
// Existing files are never overwritten unless you pass --force.
//   npm run icons            fill in missing icons
//   npm run icons -- --force regenerate all of them
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadTestData } from '../tests/helpers.js';
import { spriteSVG, iconPath } from '../public/js/sprite.js';

const data = loadTestData();
const force = process.argv.includes('--force');
const dir = fileURLToPath(new URL('../public/', import.meta.url));
mkdirSync(dir + 'icons', { recursive: true });
let made = 0;
for (const c of data.creatures) {
  if (c.icon) continue; // has its own custom file
  const file = dir + iconPath(c);
  if (existsSync(file) && !force) continue;
  writeFileSync(file, spriteSVG(data, c, 100) + '\n');
  made++;
  console.log('wrote', iconPath(c));
}
console.log(made ? `${made} icon(s) written.` : 'Every creature already has an icon.');
