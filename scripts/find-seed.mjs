// Build-time search for a rigged BOARD_SEED. Not shipped — run by hand, paste the result.
//
// This is a deliberately INDEPENDENT reimplementation of the matcher and gravity rules.
// It only ever *proposes* a seed; src/game/resolve.ts verifySeed() is the authority, and
// resolve.test.ts asserts the checked-in constant. If the two implementations ever
// disagree, that test fails — which is exactly the cross-check we want.
//
//   node scripts/find-seed.mjs                        search for a classic seed
//   node scripts/find-seed.mjs --samples=8000000      search harder
//   node scripts/find-seed.mjs --verify=2,4,3,3,4,... re-validate a specific seed

const N = 5;
const TYPES = 5;
const CELLS = N * N;

const at = (row, col) => row * N + col;
const rowOf = (i) => Math.floor(i / N);
const colOf = (i) => i % N;

function findRuns(cells) {
  const runs = [];

  for (const dir of ['row', 'col']) {
    const index = dir === 'row' ? at : (line, offset) => at(offset, line);

    for (let line = 0; line < N; line++) {
      let start = 0;
      while (start < N) {
        const type = cells[index(line, start)];
        if (type === null) {
          start++;
          continue;
        }

        let end = start;
        while (end + 1 < N && cells[index(line, end + 1)] === type) end++;

        if (end - start + 1 >= 3) {
          const run = [];
          for (let k = start; k <= end; k++) run.push(index(line, k));
          runs.push({ cells: run, type, dir });
        }

        start = end + 1;
      }
    }
  }

  return runs;
}

const ADJACENT = (() => {
  const pairs = [];
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      if (col + 1 < N) pairs.push([at(row, col), at(row, col + 1)]);
      if (row + 1 < N) pairs.push([at(row, col), at(row + 1, col)]);
    }
  }
  return pairs;
})();

function validSwaps(cells) {
  const found = [];
  const scratch = cells.slice();

  for (const [a, b] of ADJACENT) {
    [scratch[a], scratch[b]] = [scratch[b], scratch[a]];
    const runs = findRuns(scratch);
    if (runs.length) found.push({ a, b, runs });
    [scratch[a], scratch[b]] = [scratch[b], scratch[a]];
  }

  return found;
}

function gravity(cells) {
  const next = cells.slice();

  for (let col = 0; col < N; col++) {
    const stack = [];
    for (let row = 0; row < N; row++) {
      const type = next[at(row, col)];
      if (type !== null) stack.push(type);
    }

    let write = N - 1;
    for (let k = stack.length - 1; k >= 0; k--) next[at(write--, col)] = stack[k];
    for (let row = write; row >= 0; row--) next[at(row, col)] = null;
  }

  return next;
}

/**
 * The full Classic contract: exactly one valid swap, one match of three, then exactly
 * one follow-up match of three from falling tiles alone, then a clean board.
 */
function runClassicChain(seed) {
  if (findRuns(seed).length) return null;

  const swaps = validSwaps(seed);
  if (swaps.length !== 1) return null;

  const swap = swaps[0];
  if (swap.runs.length !== 1 || swap.runs[0].cells.length !== 3) return null;

  let cells = seed.slice();
  [cells[swap.a], cells[swap.b]] = [cells[swap.b], cells[swap.a]];

  const first = swap.runs[0];
  for (const i of first.cells) cells[i] = null;
  cells = gravity(cells);

  const follow = findRuns(cells);
  if (follow.length !== 1 || follow[0].cells.length !== 3) return null;

  for (const i of follow[0].cells) cells[i] = null;
  cells = gravity(cells);
  if (findRuns(cells).length) return null;

  return { swap: { a: swap.a, b: swap.b }, first, second: follow[0], settled: cells };
}

const shuffledTypes = () => {
  const order = [0, 1, 2, 3, 4];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
};

/** Backtracking fill of the open holes with types that leave the board settled. */
function solveRefill(settled) {
  const holes = [];
  for (let i = 0; i < CELLS; i++) if (settled[i] === null) holes.push(i);

  const cells = settled.slice();

  const place = (k) => {
    if (k === holes.length) return findRuns(cells).length === 0;
    for (const type of shuffledTypes()) {
      cells[holes[k]] = type;
      if (place(k + 1)) return true;
    }
    cells[holes[k]] = null;
    return false;
  };

  return place(0) ? cells : null;
}

/** Per-column, bottom-first — the shape src/game/variants.ts wants. */
function refillScript(settled, filled) {
  const script = [];

  for (let col = 0; col < N; col++) {
    const column = [];
    for (let row = N - 1; row >= 0; row--) {
      const i = at(row, col);
      if (settled[i] === null) column.push(filled[i]);
    }
    script.push(column);
  }

  return script;
}

function score({ chain, filled }) {
  let points = 0;

  // A horizontal opening match in the middle band reads best on a portrait board.
  if (chain.first.dir === 'row') points += 3;
  const openingRow = rowOf(chain.first.cells[0]);
  if (openingRow >= 1 && openingRow <= 3) points += 2;

  const centrality = (cells) =>
    cells.reduce((sum, i) => sum + Math.abs(colOf(i) - 2) + Math.abs(rowOf(i) - 2), 0) / cells.length;
  points -= centrality(chain.first.cells) * 1.2;
  points -= centrality(chain.second.cells) * 0.8;

  // A cascade in a different colour reads as a new match rather than a redraw.
  if (chain.first.type !== chain.second.type) points += 1;

  const holes = [];
  for (let i = 0; i < CELLS; i++) if (chain.settled[i] === null) holes.push(i);
  points += new Set(holes.map((i) => filled[i])).size * 0.8;

  return points;
}

function render(cells) {
  const lines = [];
  for (let row = 0; row < N; row++) {
    const cols = [];
    for (let col = 0; col < N; col++) {
      const type = cells[at(row, col)];
      cols.push(type === null ? '.' : String(type));
    }
    lines.push('  ' + cols.join(' '));
  }
  return lines.join('\n');
}

const label = (i) => `r${rowOf(i)}c${colOf(i)}`;

function report(candidate) {
  const { seed, chain, filled } = candidate;

  console.log(`\nscore ${score(candidate).toFixed(2)}`);
  console.log(render(seed));
  console.log(`\n  swap    ${label(chain.swap.a)} <-> ${label(chain.swap.b)}`);
  console.log(`  match   ${chain.first.cells.map(label).join(' ')}  type ${chain.first.type}`);
  console.log(`  cascade ${chain.second.cells.map(label).join(' ')}  type ${chain.second.type}`);
  console.log('\n  after both clears + gravity:');
  console.log(render(chain.settled));
  console.log('\n  settled:');
  console.log(render(filled));

  const rows = [];
  for (let row = 0; row < N; row++) {
    rows.push('    ' + seed.slice(row * N, row * N + N).join(', ') + ',');
  }

  console.log('\n--- paste into src/game/variants.ts ---');
  console.log(`  seed: [\n${rows.join('\n')}\n  ],`);
  console.log(`  refills: [null, ${JSON.stringify(refillScript(chain.settled, filled))}],`);
}

function verify(seed) {
  const chain = runClassicChain(seed);
  if (!chain) {
    console.error('FAIL: seed does not satisfy the classic chain (see resolve.test.ts for which rule)');
    process.exit(1);
  }

  const filled = solveRefill(chain.settled);
  if (!filled) {
    console.error('FAIL: no refill assignment leaves the board settled');
    process.exit(1);
  }

  console.log('OK: one valid swap, one match of 3, one cascade of 3, settles clean.');
  report({ seed, chain, filled });
}

function search(samples, top) {
  const found = [];

  for (let n = 0; n < samples; n++) {
    const seed = Array.from({ length: CELLS }, () => Math.floor(Math.random() * TYPES));
    if (new Set(seed).size < TYPES) continue;

    const chain = runClassicChain(seed);
    if (!chain) continue;

    const filled = solveRefill(chain.settled);
    if (!filled) continue;

    found.push({ seed, chain, filled });
  }

  console.log(`sampled ${samples.toLocaleString()} boards, ${found.length} satisfy the classic chain`);
  if (!found.length) return;

  found.sort((a, b) => score(b) - score(a));
  found.slice(0, top).forEach(report);
}

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    return [key, value];
  }),
);

if (args.has('verify')) {
  const seed = args.get('verify').split(',').map(Number);
  if (seed.length !== CELLS || seed.some((t) => !Number.isInteger(t) || t < 0 || t >= TYPES)) {
    console.error(`--verify needs ${CELLS} comma-separated types in 0..${TYPES - 1}`);
    process.exit(1);
  }
  verify(seed);
} else {
  search(Number(args.get('samples') ?? 4_000_000), Number(args.get('top') ?? 3));
}
