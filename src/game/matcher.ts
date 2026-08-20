// Pure functions: findMatches and findValidSwaps (no Pixi imports).

import { GRID_SIZE, indexOf, type Cell, type GridIndex, type Run, type Swap } from './types';

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
  for (let line = 0; line < GRID_SIZE; line++) {
    let start = 0;
    while (start < GRID_SIZE) {
      const tile = cells[cellAt(dir, line, start)];
      if (!tile) {
        start++;
        continue;
      }

      let end = start;
      while (end + 1 < GRID_SIZE) {
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

/** Every orthogonally adjacent pair on the grid — 40 of them on a 5x5. */
const ADJACENT_PAIRS: readonly Swap[] = (() => {
  const pairs: Swap[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (col + 1 < GRID_SIZE) pairs.push({ a: indexOf(row, col), b: indexOf(row, col + 1) });
      if (row + 1 < GRID_SIZE) pairs.push({ a: indexOf(row, col), b: indexOf(row + 1, col) });
    }
  }
  return pairs;
})();

/**
 * Every adjacent swap that would create a match. The rigged board is seeded so this
 * returns exactly one — that pair is what the hint pulses and the idle assist plays.
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
