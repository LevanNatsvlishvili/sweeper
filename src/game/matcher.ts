// Pure functions: findMatches and findValidSwaps (no Pixi imports).

import { GRID_COLS, GRID_ROWS, indexOf, type Cell, type GridIndex, type Run, type Swap } from './types';

const MIN_RUN = 3;

/**
 * All horizontal and vertical runs of 3+ same-type tiles. A null cell always breaks a
 * run, so this is safe to call mid-cascade while holes are still open.
 *
 * An L/T shape yields two overlapping runs; use clearedIndices() to flatten them.
 */
export function findMatches(cells: readonly Cell[]): Run[] {
  const runs: Run[] = [];
  scanLines(cells, 'row', runs);
  scanLines(cells, 'col', runs);
  return runs;
}

function scanLines(cells: readonly Cell[], dir: 'row' | 'col', out: Run[]): void {
  // The grid is taller than it is wide, so rows and columns differ in both count and length.
  const lineCount = dir === 'row' ? GRID_ROWS : GRID_COLS;
  const lineLength = dir === 'row' ? GRID_COLS : GRID_ROWS;

  for (let line = 0; line < lineCount; line++) {
    let start = 0;
    while (start < lineLength) {
      const tile = cells[cellAt(dir, line, start)];
      if (!tile) {
        start++;
        continue;
      }

      let end = start;
      while (end + 1 < lineLength) {
        const next = cells[cellAt(dir, line, end + 1)];
        if (!next || next.type !== tile.type) break;
        end++;
      }

      if (end - start + 1 >= MIN_RUN) {
        const run: GridIndex[] = [];
        for (let k = start; k <= end; k++) run.push(cellAt(dir, line, k));
        out.push({ cells: run, type: tile.type, dir });
      }

      start = end + 1;
    }
  }
}

function cellAt(dir: 'row' | 'col', line: number, offset: number): GridIndex {
  return dir === 'row' ? indexOf(line, offset) : indexOf(offset, line);
}

/** Flattens overlapping runs (L and T shapes) into the ascending set of cells to clear. */
export function clearedIndices(runs: readonly Run[]): GridIndex[] {
  const unique = new Set<GridIndex>();
  for (const run of runs) {
    for (const index of run.cells) unique.add(index);
  }
  return [...unique].sort((a, b) => a - b);
}

/** Every orthogonally adjacent pair on the grid — 85 of them on a 10x5. */
const ADJACENT_PAIRS: readonly Swap[] = (() => {
  const pairs: Swap[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      if (col + 1 < GRID_COLS) pairs.push({ a: indexOf(row, col), b: indexOf(row, col + 1) });
      if (row + 1 < GRID_ROWS) pairs.push({ a: indexOf(row, col), b: indexOf(row + 1, col) });
    }
  }
  return pairs;
})();

/**
 * Every adjacent swap that would create a match. Used to validate the player's move and
 * to tell whether the board still has anything to do; see bestSwap for ranking them.
 */
export function findValidSwaps(cells: readonly Cell[]): Swap[] {
  const valid: Swap[] = [];
  // One reused scratch array rather than 40 slices — the debug overlay calls this per frame.
  const scratch = cells.slice();

  for (const pair of ADJACENT_PAIRS) {
    if (!scratch[pair.a] || !scratch[pair.b]) continue;
    swapInPlace(scratch, pair);
    if (findMatches(scratch).length > 0) valid.push(pair);
    swapInPlace(scratch, pair);
  }

  return valid;
}

function swapInPlace(cells: Cell[], swap: Swap): void {
  const held = cells[swap.a];
  cells[swap.a] = cells[swap.b];
  cells[swap.b] = held;
}

/**
 * The legal swap that clears the most tiles right away. Cascades depend on refill draws
 * that haven't happened yet, so immediate clear size is the honest thing to rank on.
 *
 * This is the pair the idle hint pulses and points its arrow at, and the move verifyRun
 * simulates. Merely taking the first swap in scan order suggests the dullest move on the
 * board, which is a poor advert for the game.
 */
export function bestSwap(cells: readonly Cell[]): Swap | null {
  const scratch = cells.slice();
  let best: Swap | null = null;
  let bestCleared = 0;

  for (const pair of ADJACENT_PAIRS) {
    if (!scratch[pair.a] || !scratch[pair.b]) continue;
    swapInPlace(scratch, pair);
    const cleared = clearedIndices(findMatches(scratch)).length;
    swapInPlace(scratch, pair);

    if (cleared > bestCleared) {
      bestCleared = cleared;
      best = pair;
    }
  }

  return best;
}
