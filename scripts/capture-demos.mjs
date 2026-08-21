/**
 * Records 15s WebM captures of each variant for the portfolio page.
 * Requires Playwright — installed on first run via npx.
 *
 * Usage: npm run portfolio && npm run capture
 *
 * Loads the playable with `?assist=1` so idle assist auto-plays after the hint.
 * The shipped ad never sets that flag.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portfolioDir = path.join(root, 'portfolio');
const playableHtml = path.join(portfolioDir, 'playable.html');
const CAPTURE_MS = 15_000;
const VIEWPORT = { width: 720, height: 1280 };

/** Cascade first — reel opener per the packaging spec. */
const VARIANTS = [
  { id: 'cascade', out: 'cascade.webm' },
  { id: 'classic', out: 'classic.webm' },
];

if (!fs.existsSync(playableHtml)) {
  console.error('Missing portfolio/playable.html — run `npm run portfolio` first.');
  process.exit(1);
}

const playableUrl = pathToFileUrl(playableHtml);

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('Playwright not installed. Run: npx playwright install chromium');
    console.error('Then retry: npm run capture');
    process.exit(1);
  }

  for (const variant of VARIANTS) {
    const outPath = path.join(portfolioDir, variant.out);
    const videoDir = path.join(portfolioDir, '.capture-tmp');

    fs.mkdirSync(videoDir, { recursive: true });

    console.log(`Recording ${variant.id} (${CAPTURE_MS / 1000}s) -> ${variant.out}`);

    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: VIEWPORT,
      recordVideo: { dir: videoDir, size: VIEWPORT },
    });
    const page = await context.newPage();

    await page.goto(`${playableUrl}?variant=${variant.id}&assist=1`, { waitUntil: 'load' });
    await page.waitForTimeout(CAPTURE_MS);

    const video = page.video();
    await context.close();
    await browser.close();

    if (!video) {
      console.error(`No video recorded for ${variant.id}`);
      process.exit(1);
    }

    const recorded = await video.path();
    fs.renameSync(recorded, outPath);
  }

  fs.rmSync(path.join(portfolioDir, '.capture-tmp'), { recursive: true, force: true });
  console.log('\nCaptures ready. Refresh portfolio/index.html to preview.');
}

function pathToFileUrl(filePath) {
  const resolved = path.resolve(filePath).replace(/\\/g, '/');
  return `file:///${encodeURI(resolved).replace(/^\/+/, '')}`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
