import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distHtml = path.join(root, 'dist', 'index.html');
const portfolioDir = path.join(root, 'portfolio');
const playableHtml = path.join(portfolioDir, 'playable.html');
const statsJson = path.join(portfolioDir, 'build-stats.json');

if (!fs.existsSync(distHtml)) {
  console.error('Missing dist/index.html — run `npm run build` first.');
  process.exit(1);
}

fs.mkdirSync(portfolioDir, { recursive: true });

const playable = fs.readFileSync(distHtml);
fs.writeFileSync(playableHtml, playable);

const gzipBytes = zlib.gzipSync(playable).length;
const rawBytes = playable.length;

const stats = {
  gzipBytes,
  rawBytes,
  gzipKb: (gzipBytes / 1024).toFixed(1),
  rawKb: (rawBytes / 1024).toFixed(1),
  generatedAt: new Date().toISOString(),
};

fs.writeFileSync(statsJson, JSON.stringify(stats, null, 2) + '\n');

console.log('Portfolio bundle updated:');
console.log('  playable.html ->', playableHtml);
console.log('  build-stats.json ->', statsJson);
console.log(`  size: ${stats.rawKb} KB raw, ${stats.gzipKb} KB gzipped`);
