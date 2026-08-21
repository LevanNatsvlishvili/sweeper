import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distHtml = path.join(root, 'dist', 'index.html');
const portfolioDir = path.join(root, 'portfolio');
const playableHtml = path.join(portfolioDir, 'playable.html');
const statsJson = path.join(portfolioDir, 'build-stats.json');
const indexHtml = path.join(portfolioDir, 'index.html');

const BUDGET_BYTES = 2.5 * 1024 * 1024;

if (!fs.existsSync(distHtml)) {
  console.error('Missing dist/index.html — run `npm run build` first.');
  process.exit(1);
}

if (!fs.existsSync(indexHtml)) {
  console.error('Missing portfolio/index.html — the portfolio shell must be committed.');
  process.exit(1);
}

fs.mkdirSync(portfolioDir, { recursive: true });

const playable = fs.readFileSync(distHtml);
fs.writeFileSync(playableHtml, playable);

const gzipBytes = zlib.gzipSync(playable, { level: 9 }).length;
const rawBytes = playable.length;

const stats = {
  gzipBytes,
  rawBytes,
  gzipKb: (gzipBytes / 1024).toFixed(1),
  rawKb: (rawBytes / 1024).toFixed(1),
  budgetPct: ((gzipBytes / BUDGET_BYTES) * 100).toFixed(1),
  generatedAt: new Date().toISOString(),
};

fs.writeFileSync(statsJson, JSON.stringify(stats, null, 2) + '\n');

console.log('Portfolio bundle updated:');
console.log('  index.html     ->', indexHtml);
console.log('  playable.html  ->', playableHtml);
console.log('  build-stats.json ->', statsJson);
console.log(`  size: ${stats.rawKb} KB raw, ${stats.gzipKb} KB gzipped (${stats.budgetPct}% of 2.5 MB budget)`);
console.log('\nPreview: npx serve portfolio');
