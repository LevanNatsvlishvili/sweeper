// Reports the built playable against the ad-network size budget.

import { gzipSync } from 'node:zlib';
import { readFileSync, statSync } from 'node:fs';

/** Meta is the strictest major network; CLAUDE.md sets the hard cap here. */
const BUDGET_BYTES = 2.5 * 1024 * 1024;
const OUT = 'dist/index.html';

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

const raw = statSync(OUT).size;
const gz = gzipSync(readFileSync(OUT), { level: 9 }).length;
const pct = (gz / BUDGET_BYTES) * 100;

console.log(`  file    ${OUT}`);
console.log(`  raw     ${kb(raw)}`);
console.log(`  gzip    ${kb(gz)}  (${gz} bytes)`);
console.log(`  budget  ${kb(BUDGET_BYTES)}  ->  ${pct.toFixed(1)}% used`);

if (gz > BUDGET_BYTES) {
  console.error(`\n  FAIL: over budget by ${kb(gz - BUDGET_BYTES)}`);
  process.exit(1);
}
console.log(`\n  PASS: ${kb(BUDGET_BYTES - gz)} headroom`);
