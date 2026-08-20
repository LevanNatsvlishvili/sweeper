import { describe, expect, it } from 'vitest';

import { clearCells, createBoard } from './board';
import { generateBoard } from './generate';
import { bestSwap, clearedIndices, findMatches, findValidSwaps } from './matcher';
import { createRng } from './rng';
import { CELL_COUNT, GRID_COLS, type TypeId } from './types';

const SEEDS = [1, 2, 3, 17, 404, 20260820];

const cellsOf = (layout: TypeId[]) => createBoard(layout).cells;

// Every layout below is the pattern (2*row + col) % 5 with one match planted in it.
// That base never produces a run — neighbours differ by 1 across a row and by 2 down a
// column — so whatever the test plants is provably the only match on the board.

describe('findMatches', () => {
  it('finds a horizontal run of three', () => {
    // prettier-ignore
    const cells = cellsOf([
      1, 1, 1, 3, 4,
      2, 3, 4, 0, 1,
      4, 0, 1, 2, 3,
      1, 2, 3, 4, 0,
      3, 4, 0, 1, 2,
      0, 1, 2, 3, 4,
      2, 3, 4, 0, 1,
      4, 0, 1, 2, 3,
      1, 2, 3, 4, 0,
      3, 4, 0, 1, 2,
    ]);

    const runs = findMatches(cells);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ dir: 'row', type: 1, cells: [0, 1, 2] });
  });

  it('finds a vertical run of three', () => {
    // prettier-ignore
    const cells = cellsOf([
      0, 1, 2, 3, 4,
      2, 3, 4, 0, 1,
      4, 3, 1, 2, 3,
      1, 3, 3, 4, 0,
      3, 4, 0, 1, 2,
      0, 1, 2, 3, 4,
      2, 3, 4, 0, 1,
      4, 0, 1, 2, 3,
      1, 2, 3, 4, 0,
      3, 4, 0, 1, 2,
    ]);

    const runs = findMatches(cells);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ dir: 'col', type: 3, cells: [6, 11, 16] });
  });

  it('spans the full width as one run, not three overlapping triples', () => {
    // prettier-ignore
    const cells = cellsOf([
      0, 1, 2, 3, 4,
      2, 3, 4, 0, 1,
      4, 0, 1, 2, 3,
      1, 2, 3, 4, 0,
      3, 4, 0, 1, 2,
      3, 3, 3, 3, 3,
      2, 3, 4, 0, 1,
      4, 0, 1, 2, 3,
      1, 2, 3, 4, 0,
      3, 4, 0, 1, 2,
    ]);

    const runs = findMatches(cells);

    expect(runs).toHaveLength(1);
    expect(runs[0].cells).toEqual([25, 26, 27, 28, 29]);
  });

  it('finds a vertical run longer than the board is wide', () => {
    // A 10-row column can hold a run of 6 — impossible back when the grid was square.
    // prettier-ignore
    const cells = cellsOf([
      0, 1, 2, 3, 4,
      2, 3, 4, 0, 1,
      4, 0, 2, 2, 3,
      1, 2, 2, 4, 0,
      3, 4, 2, 1, 2,
      0, 1, 2, 3, 4,
      2, 3, 2, 0, 1,
      4, 0, 2, 2, 3,
      1, 2, 3, 4, 0,
      3, 4, 0, 1, 2,
    ]);

    const runs = findMatches(cells);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ dir: 'col', type: 2, cells: [12, 17, 22, 27, 32, 37] });
  });

  it('treats a hole as a break in the line', () => {
    // prettier-ignore
    const cells = cellsOf([
      1, 1, 1, 3, 4,
      2, 3, 4, 0, 1,
      4, 0, 1, 2, 3,
      1, 2, 3, 4, 0,
      3, 4, 0, 1, 2,
      0, 1, 2, 3, 4,
      2, 3, 4, 0, 1,
      4, 0, 1, 2, 3,
      1, 2, 3, 4, 0,
      3, 4, 0, 1, 2,
    ]);

    expect(findMatches(cells)).toHaveLength(1);

    cells[1] = null;

    expect(findMatches(cells)).toHaveLength(0);
  });

  it('returns nothing for a freshly generated board', () => {
    for (const seed of SEEDS) {
      expect(findMatches(generateBoard(createRng(seed)).cells)).toEqual([]);
    }
  });
});

describe('clearedIndices', () => {
  it('dedupes the shared cell of a T shape', () => {
    // prettier-ignore
    const cells = cellsOf([
      0, 1, 2, 3, 4,
      2, 3, 4, 0, 1,
      4, 0, 1, 2, 3,
      1, 2, 3, 4, 0,
      3, 4, 3, 1, 2,
      0, 3, 3, 3, 4,
      2, 3, 4, 0, 1,
      4, 0, 1, 2, 3,
      1, 2, 3, 4, 0,
      3, 4, 0, 1, 2,
    ]);

    const runs = findMatches(cells);
    expect(runs).toHaveLength(2);

    // Row r5c1..r5c3 and column c2 r3..r5 overlap at r5c2 — five cells clear, not six.
    expect(clearedIndices(runs)).toEqual([17, 22, 26, 27, 28]);
  });
});

describe('findValidSwaps', () => {
  it('only returns swaps that really do create a match', () => {
    for (const seed of SEEDS) {
      const cells = generateBoard(createRng(seed)).cells;

      for (const swap of findValidSwaps(cells)) {
        const probe = cells.slice();
        [probe[swap.a], probe[swap.b]] = [probe[swap.b], probe[swap.a]];
        expect(findMatches(probe).length).toBeGreaterThan(0);
      }
    }
  });

  it('finds a legal move on every generated board', () => {
    for (const seed of SEEDS) {
      expect(findValidSwaps(generateBoard(createRng(seed)).cells).length).toBeGreaterThan(0);
    }
  });

  it('leaves the board untouched', () => {
    const cells = generateBoard(createRng(5)).cells;
    const before = cells.slice();

    findValidSwaps(cells);

    expect(cells).toEqual(before);
  });

  it('ignores pairs involving a hole', () => {
    const board = generateBoard(createRng(5));
    const swap = findValidSwaps(board.cells)[0];
    clearCells(board, [swap.a, swap.b]);

    for (const found of findValidSwaps(board.cells)) {
      expect(found.a).not.toBe(swap.a);
      expect(found.b).not.toBe(swap.b);
    }
  });
});

describe('bestSwap', () => {
  it('picks a move that clears at least as much as any other legal move', () => {
    for (const seed of SEEDS) {
      const cells = generateBoard(createRng(seed)).cells;

      const clearedBy = (swap: { a: number; b: number }) => {
        const probe = cells.slice();
        [probe[swap.a], probe[swap.b]] = [probe[swap.b], probe[swap.a]];
        return clearedIndices(findMatches(probe)).length;
      };

      const best = bestSwap(cells)!;
      expect(best).not.toBeNull();

      for (const swap of findValidSwaps(cells)) {
        expect(clearedBy(best)).toBeGreaterThanOrEqual(clearedBy(swap));
      }
    }
  });

  it('returns null when the board has no legal move', () => {
    // The (2*row + col) % 5 lattice is match-free AND has zero legal swaps — every
    // adjacent pair is a different type, so no exchange can line three up.
    const deadlock = Array.from(
      { length: CELL_COUNT },
      (_, i) => ((2 * Math.floor(i / GRID_COLS) + (i % GRID_COLS)) % 5) as TypeId,
    );
    const cells = createBoard(deadlock).cells;

    expect(findMatches(cells)).toEqual([]);
    expect(findValidSwaps(cells)).toEqual([]);
    expect(bestSwap(cells)).toBeNull();
  });
});
