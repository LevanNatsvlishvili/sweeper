// Build-time search for a rigged BOARD_SEED. Not shipped — run by hand, paste the result.
//
// This is a deliberately INDEPENDENT reimplementation of the matcher and gravity rules.
// It only ever *proposes* a seed; src/game/resolve.ts verifySeed() is the authority, and
// resolve.test.ts asserts the checked-in constant. If the two implementations ever
// disagree, that test fails — which is exactly the cross-check we want.
//
// Random sampling is hopeless on a 10x5: only ~0.001% of match-free boards have exactly
// one valid swap, before the cascade condition is even considered. So this anneals
// towards a cost function that scores the whole chain at once, which lands a solution in
// a few hundred evaluations instead of a few billion samples.
//
//   node scripts/find-seed.mjs                        search for a classic seed
//   node scripts/find-seed.mjs --candidates=500       widen the pool before ranking
//   node scripts/find-seed.mjs --verify=4,2,4,3,3,... re-validate a specific seed

const ROWS = 10;
const COLS = 5;
const TYPES = 5;
const CELLS = ROWS * COLS;

const at = (row, col) => row * COLS + col;
const rowOf = (i) => Math.floor(i / COLS);
const colOf = (i) => i % COLS;

function findRuns(cells) {
  const runs = [];

  for (const dir of ['row', 'col']) {
    const lineCount = dir === 'row' ? ROWS : COLS;
    const lineLength = dir === 'row' ? COLS : ROWS;
    const index = dir === 'row' ? at : (line, offset) => at(offset, line);

    for (let line = 0; line < lineCount; line++) {
      let start = 0;
      while (start < lineLength) {
        const type = cells[index(line, start)];
        if (type === null) {
          start++;
          continue;
        }

        let end = start;
        while (end + 1 < lineLength && cells[index(line, end + 1)] === type) end++;

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
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (col + 1 < COLS) pairs.push([at(row, col), at(row, col + 1)]);
      if (row + 1 < ROWS) pairs.push([at(row, col), at(row + 1, col)]);
    }
  }
  return pairs;
})();

function validSwaps(cells) {
  const found = [];
  const scratch = cells.slice();

  for (const [a, b] of ADJACENT) {
    if (scratch[a] === null || scratch[b] === null) continue;
    [scratch[a], scratch[b]] = [scratch[b], scratch[a]];
    const runs = findRuns(scratch);
    if (runs.length) found.push({ a, b, runs });
    [scratch[a], scratch[b]] = [scratch[b], scratch[a]];
  }

  return found;
}

function gravity(cells) {
  const next = cells.slice();

  for (let col = 0; col < COLS; col++) {
    const stack = [];
    for (let row = 0; row < ROWS; row++) {
      const type = next[at(row, col)];
      if (type !== null) stack.push(type);
    }

    let write = ROWS - 1;
    for (let k = stack.length - 1; k >= 0; k--) next[at(write--, col)] = stack[k];
    for (let row = write; row >= 0; row--) next[at(row, col)] = null;
  }

  return next;
}

/**
 * Distance from a valid seed, as one number the annealer can descend. Zero means the
 * board satisfies the whole Classic contract: no opening match, exactly one valid swap,
 * one match of three, one follow-up match of three from falling tiles alone, then clean.
 */
function cost(seed) {
  const opening = findRuns(seed);
  if (opening.length) return 1000 + opening.length * 50;

  const swaps = validSwaps(seed);
  let penalty = Math.abs(swaps.length - 1) * 20;
  if (swaps.length !== 1) return penalty + 200;

  const swap = swaps[0];
  let cells = seed.slice();
  [cells[swap.a], cells[swap.b]] = [cells[swap.b], cells[swap.a]];

  const first = findRuns(cells);
  penalty += Math.abs(first.length - 1) * 15;
  const firstCleared = new Set(first.flatMap((run) => run.cells));
  penalty += Math.abs(firstCleared.size - 3) * 10;

  for (const i of firstCleared) cells[i] = null;
  cells = gravity(cells);

  const second = findRuns(cells);
  penalty += Math.abs(second.length - 1) * 15;
  if (second.length === 0) return penalty + 60;

  const secondCleared = new Set(second.flatMap((run) => run.cells));
  penalty += Math.abs(secondCleared.size - 3) * 10;

  for (const i of secondCleared) cells[i] = null;
  cells = gravity(cells);

  return penalty + findRuns(cells).length * 25;
}

function anneal(steps = 60000) {
  const current = Array.from({ length: CELLS }, () => Math.floor(Math.random() * TYPES));
  let score = cost(current);

  for (let step = 0; step < steps && score > 0; step++) {
    const temperature = 6 * (1 - step / steps) + 0.02;
    const cell = Math.floor(Math.random() * CELLS);
    const previous = current[cell];

    let replacement;
    do {
      replacement = Math.floor(Math.random() * TYPES);
    } while (replacement === previous);

    current[cell] = replacement;
    const candidate = cost(current);

    if (candidate <= score || Math.random() < Math.exp((score - candidate) / temperature)) {
      score = candidate;
    } else {
      current[cell] = previous;
    }
  }

  return score === 0 ? current : null;
}

/** Replays a cost-0 seed to recover the swap, both matches, and the settled board. */
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

  for (let col = 0; col < COLS; col++) {
    const column = [];
    for (let row = ROWS - 1; row >= 0; row--) {
      const i = at(row, col);
      if (settled[i] === null) column.push(filled[i]);
    }
    script.push(column);
  }

  return script;
}

function score({ chain, filled }) {
  let points = 0;

  if (chain.first.dir === 'row') points += 4;

  // Mid-board keeps the match visible and leaves a tall stack above it to fall.
  points -= Math.abs(rowOf(chain.first.cells[0]) - Math.floor(ROWS / 2)) * 1.4;

  const centrality = (cells) =>
    cells.reduce((sum, i) => sum + Math.abs(colOf(i) - (COLS - 1) / 2), 0) / cells.length;
  points -= centrality(chain.first.cells) * 1.2;
  points -= centrality(chain.second.cells) * 0.6;

  // A cascade in a different colour reads as a new match rather than a redraw.
  if (chain.first.type !== chain.second.type) points += 1.5;

  // Reward a chain whose two matches between them move every column.
  const columns = new Set([...chain.first.cells, ...chain.second.cells].map(colOf));
  points += columns.size * 1.2;

  const holes = [];
  for (let i = 0; i < CELLS; i++) if (chain.settled[i] === null) holes.push(i);
  points += new Set(holes.map((i) => filled[i])).size * 0.7;

  return points;
}

function render(cells) {
  const lines = [];
  for (let row = 0; row < ROWS; row++) {
    const cols = [];
    for (let col = 0; col < COLS; col++) {
      const type = cells[at(row, col)];
      cols.push(type === null ? '.' : String(type));
    }
    lines.push(`  r${row} ` + cols.join(' '));
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
  for (let row = 0; row < ROWS; row++) {
    rows.push('    ' + seed.slice(row * COLS, row * COLS + COLS).join(', ') + ',');
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

function search(wanted, top) {
  const pool = [];
  const started = Date.now();
  let attempts = 0;

  while (pool.length < wanted && Date.now() - started < 120000) {
    attempts++;
    const seed = anneal();
    if (!seed) continue;
    if (new Set(seed).size < TYPES) continue;

    const chain = runClassicChain(seed);
    if (!chain) continue;

    const filled = solveRefill(chain.settled);
    if (!filled) continue;

    pool.push({ seed, chain, filled });
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`${attempts} annealing runs produced ${pool.length} valid seeds in ${elapsed}s`);
  if (!pool.length) return;

  pool.sort((a, b) => score(b) - score(a));
  pool.slice(0, top).forEach(report);
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
  search(Number(args.get('candidates') ?? 250), Number(args.get('top') ?? 3));
}
