// Sanity-checks the word packs after you edit them.   npm run check-words
const fs = require('fs');
const path = require('path');
const { PACKS, ALIASES, buildPool } = require('../lib/words');

const problems = [];
const where = new Map(); // word -> ['classic:1', ...]

for (const [id, pack] of Object.entries(PACKS)) {
  const inPack = new Set();
  for (const d of [1, 2, 3]) {
    for (const w of pack.words[d]) {
      if (!/^[a-z0-9]+( [a-z0-9]+)*$/.test(w)) problems.push(`${id}: "${w}" should be lowercase letters/digits with single spaces`);
      if (inPack.has(w)) problems.push(`${id}: "${w}" is listed more than once`);
      inPack.add(w);
      where.set(w, [...(where.get(w) || []), `${id}:${d}`]);
    }
  }
}

// A key that appears twice in the ALIASES object silently overwrites the first one, so look at the source.
const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'words.js'), 'utf8');
const block = src.slice(src.indexOf('const ALIASES = {'), src.indexOf('};', src.indexOf('const ALIASES = {')));
const keys = [...block.matchAll(/^\s*(?:'([^']+)'|([a-z0-9]+)):\s*\[/gm)].map((m) => m[1] || m[2]);
const seenKeys = new Set();
for (const k of keys) {
  if (seenKeys.has(k)) problems.push(`aliases: "${k}" is defined more than once (only the last one counts)`);
  seenKeys.add(k);
}
for (const [w, list] of Object.entries(ALIASES)) {
  if (!where.has(w)) problems.push(`aliases: "${w}" is not a word in any pack`);
  if (new Set(list).size !== list.length) problems.push(`aliases: "${w}" lists the same alias twice`);
}

for (const [id, pack] of Object.entries(PACKS)) {
  const n = [1, 2, 3].map((d) => pack.words[d].length);
  console.log(`${pack.emoji} ${pack.name.padEnd(24)} easy ${String(n[0]).padStart(3)} · medium ${String(n[1]).padStart(3)} · hard ${String(n[2]).padStart(3)} · total ${n[0] + n[1] + n[2]}`);
}
const all = buildPool(Object.keys(PACKS));
console.log(`\n${all[1].length + all[2].length + all[3].length} different words across all packs, ${Object.keys(ALIASES).length} with aliases.`);

if (problems.length) {
  console.log(`\n❌ ${problems.length} problem(s):`);
  problems.forEach((p) => console.log(`  - ${p}`));
  process.exit(1);
}
console.log('✅ Word packs look good.');
